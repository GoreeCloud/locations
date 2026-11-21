package com.goreecloud.locations

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import java.util.concurrent.TimeUnit
import java.io.IOException
import java.time.Instant
import java.util.UUID

/**
 * No boot receiver, persisted token, background-location permission or covert tracking.
 * All pending fixes exist only in memory while this visible, user-started service runs.
 */
internal object ForegroundTracking {
    @Volatile var session: Session? = null
    var running by mutableStateOf(false)
        internal set
    var lastProblem by mutableStateOf("")
        internal set
    var droppedFixes by mutableStateOf(0)
        internal set
}

class ForegroundTrackingService : Service(), LocationListener {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val network = OkHttpClient.Builder().followRedirects(false).callTimeout(20,TimeUnit.SECONDS).build()
    private val pending = Channel<JSONObject>(64) // Backpressure: full queue rejects fixes, never silently evicts an older one.
    private var manager: LocationManager? = null
    private var subscribed = false
    private var workersStarted = false

    override fun onBind(intent: Intent?): IBinder? = null

    private fun locationAllowed(): Boolean {
        val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }

    private fun visibleNotificationAllowed(): Boolean {
        val manager = getSystemService(NotificationManager::class.java)
        return manager.areNotificationsEnabled() &&
            (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED)
    }

    private fun stopWithProblem(problem: String) {
        // Withdraw local consent immediately, before the main thread delivers onDestroy.
        ForegroundTracking.running = false
        ForegroundTracking.session = null
        ForegroundTracking.lastProblem = problem
        stopSelf()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (intent?.action != START || ForegroundTracking.session == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (!locationAllowed() || !visibleNotificationAllowed()) {
            stopWithProblem("Tracking stopped: foreground location and visible notifications are required.")
            return START_NOT_STICKY
        }
        val locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        val provider = when {
            fine && locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
            locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
            else -> null
        }
        if (provider == null) {
            stopWithProblem("Tracking stopped: enable device location services.")
            return START_NOT_STICKY
        }
        try {
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(
                NotificationChannel(CHANNEL, "Active location recording", NotificationManager.IMPORTANCE_LOW)
            )
            val stopIntent = PendingIntent.getService(
                this, 0, Intent(this, ForegroundTrackingService::class.java).setAction(STOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val notification = Notification.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentTitle("GoreeCloud Locations recording active")
                .setContentText("Opt-in tracking is on. Tap Stop to end it.")
                .setOngoing(true)
                .addAction(Notification.Action.Builder(
                    Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel), "Stop", stopIntent
                ).build())
                .build()
            startForeground(NOTIFICATION_ID, notification)
            if (!subscribed) {
                manager = locationManager
                locationManager.requestLocationUpdates(provider, 120_000L, 50f, this, Looper.getMainLooper())
                subscribed = true
            }
            ForegroundTracking.lastProblem = ""
            ForegroundTracking.droppedFixes = 0
            ForegroundTracking.running = true
            if (!workersStarted) {
                workersStarted = true
                scope.launch {
                    for (fix in pending) uploadBounded(fix)
                }
                scope.launch { verifyConsentPeriodically() }
            }
        } catch (_: SecurityException) {
            stopWithProblem("Tracking stopped: location permission was revoked.")
        } catch (_: Exception) {
            stopWithProblem("Unable to start foreground tracking.")
        }
        return START_NOT_STICKY
    }

    private suspend fun requestCancellable(session: Session, path: String, payload: JSONObject? = null): JSONObject {
        // The service owns each HTTP Call. Stop/sign-out cancels calls instead of
        // leaving synchronous requests running after the notification disappears.
        val url = validateOrigin(session.origin) + "/api/v1" + path
        val builder = Request.Builder().url(url)
            .header("Authorization", "Bearer " + session.token)
            .header("Accept", "application/json")
        if (payload != null) {
            builder.post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
        }
        return suspendCancellableCoroutine { continuation ->
            val call = network.newCall(builder.build())
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (continuation.isActive) continuation.resumeWithException(e)
                }
                override fun onResponse(call: Call, response: Response) {
                    response.use {
                        val data = try { JSONObject(response.body?.string() ?: "{}") }
                            catch (_: Exception) { JSONObject() }
                        if (continuation.isActive) {
                            if (response.isSuccessful) continuation.resume(data)
                            else continuation.resumeWithException(
                                IllegalStateException(data.optString("error","Request failed: HTTP " + response.code))
                            )
                        }
                    }
                }
            })
        }
    }

    private suspend fun verifyConsentPeriodically() {
        while (scope.isActive) {
            delay(120_000L)
            if (!locationAllowed() || !visibleNotificationAllowed()) {
                stopWithProblem("Tracking stopped: location or notification permission was withdrawn.")
                return
            }
            val active = ForegroundTracking.session ?: run { stopSelf(); return }
            try {
                val me = request(active.origin, active.token, "/me").getJSONObject("account")
                if (!me.optBoolean("recording_enabled", false)) {
                    stopWithProblem("Tracking stopped: recording consent was withdrawn on the server.")
                    return
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: IllegalStateException) {
                if (isInvalidAuthorization(e)) {
                    stopWithProblem("Tracking stopped: server authorization is no longer valid.")
                    return
                }
            } catch (_: Exception) {
                // A temporary network failure is not consent to store more data;
                // the uploader still checks server permission before every fix.
            }
        }
    }

    private fun isInvalidAuthorization(error: IllegalStateException): Boolean =
        error.message?.contains("Enable recording first") == true ||
        error.message?.contains("Session expired or invalid") == true ||
        error.message?.contains("Authentication required") == true

    private suspend fun uploadBounded(payload: JSONObject) {
        for (attempt in 0..2) {
            if (!scope.isActive || !ForegroundTracking.running) return
            val active = ForegroundTracking.session ?: return
            try {
                val me = request(active.origin, active.token, "/me").getJSONObject("account")
                if (!me.optBoolean("recording_enabled", false)) {
                    stopWithProblem("Tracking stopped: recording consent was withdrawn on the server.")
                    return
                }
                if (!scope.isActive || !ForegroundTracking.running || ForegroundTracking.session !== active) return
                requestCancellable(active, "/locations", payload)
                ForegroundTracking.lastProblem = ""
                return
            } catch (e: CancellationException) {
                throw e
            } catch (e: IllegalStateException) {
                if (isInvalidAuthorization(e)) {
                    stopWithProblem("Tracking stopped: server authorization or consent is no longer valid.")
                    return
                }
                ForegroundTracking.lastProblem = "A location upload was rejected; it was not retained."
                return
            } catch (_: IOException) {
                if (attempt < 2) delay(15_000L * (1 shl attempt))
            } catch (_: Exception) {
                ForegroundTracking.lastProblem = "A location update failed; it was not retained."
                return
            }
        }
        ForegroundTracking.lastProblem =
            "Network unavailable. The fix was dropped after bounded retries; no persistent queue is used."
    }

    override fun onLocationChanged(location: Location) {
        if (!ForegroundTracking.running || ForegroundTracking.session == null) return
        if (!locationAllowed() || !visibleNotificationAllowed()) {
            stopWithProblem("Tracking stopped: permission changed.")
            return
        }
        val now = System.currentTimeMillis()
        if (!location.latitude.isFinite() || !location.longitude.isFinite() ||
            location.latitude !in -90.0..90.0 || location.longitude !in -180.0..180.0 ||
            !location.hasAccuracy() || !location.accuracy.isFinite() ||
            location.accuracy < 0f || location.accuracy > 250f ||
            location.time < now - 5 * 60000L || location.time > now + 60000L) {
            ForegroundTracking.lastProblem = "A stale or inaccurate location fix was ignored."
            return
        }
        val payload = JSONObject()
            .put("latitude", location.latitude).put("longitude", location.longitude)
            .put("accuracyM", location.accuracy.toDouble())
            .put("capturedAt", Instant.ofEpochMilli(location.time).toString())
            .put("source", "android_foreground")
            // Stable for all retries of this fix and scoped to the account on the server.
            .put("clientKey", "androidfg_" + UUID.randomUUID().toString())
        if (pending.trySend(payload).isFailure) {
            ForegroundTracking.droppedFixes++
            ForegroundTracking.lastProblem = "Location buffer full. A new fix was dropped; no fix was stored offline."
        }
    }

    override fun onProviderDisabled(provider: String) {
        stopWithProblem("Tracking stopped: location provider disabled.")
    }

    override fun onDestroy() {
        if (subscribed) {
            try { manager?.removeUpdates(this) } catch (_: Exception) { }
            subscribed = false
        }
        ForegroundTracking.running = false
        scope.cancel()
        network.dispatcher.cancelAll()
        network.connectionPool.evictAll()
        pending.close()
        ForegroundTracking.session = null
        ForegroundTracking.running = false
        super.onDestroy()
    }

    companion object {
        const val START = "com.goreecloud.locations.TRACKING_START"
        const val STOP = "com.goreecloud.locations.TRACKING_STOP"
        private const val CHANNEL = "goreecloud_locations_active"
        private const val NOTIFICATION_ID = 1020
    }
}
