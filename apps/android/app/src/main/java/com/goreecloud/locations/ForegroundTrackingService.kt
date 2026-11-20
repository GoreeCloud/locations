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
import android.os.IBinder
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

/**
 * In-memory session only. The service is never automatically restarted or enabled by boot.
 * User-initiated explicit consent is required on every application process lifetime.
 */
internal object ForegroundTracking {
    @Volatile var session: Session? = null
    var running by mutableStateOf(false)
        internal set
    var lastProblem by mutableStateOf("")
        internal set
}

class ForegroundTrackingService : Service(), LocationListener {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var manager: LocationManager? = null
    private var subscribed = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (intent?.action != START || ForegroundTracking.session == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        if (!fine && !coarse) {
            ForegroundTracking.lastProblem = "Tracking stopped: location permission is missing."
            stopSelf()
            return START_NOT_STICKY
        }
        val locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val provider = when {
            fine && locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
            locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
            else -> null
        }
        if (provider == null) {
            ForegroundTracking.lastProblem = "Tracking stopped: turn on device location services."
            stopSelf()
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
                // Sampling is intentionally conservative; no background-location permission.
                locationManager.requestLocationUpdates(provider, 120_000L, 50f, this, Looper.getMainLooper())
                subscribed = true
            }
            ForegroundTracking.lastProblem = ""
            ForegroundTracking.running = true
        } catch (_: SecurityException) {
            ForegroundTracking.lastProblem = "Tracking stopped: Android location permission was revoked."
            stopSelf()
        } catch (_: Exception) {
            ForegroundTracking.lastProblem = "Unable to start foreground tracking."
            stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onLocationChanged(location: Location) {
        val session = ForegroundTracking.session ?: return
        val payload = JSONObject()
            .put("latitude", location.latitude).put("longitude", location.longitude)
            .put("accuracyM", if (location.hasAccuracy()) location.accuracy.toDouble() else JSONObject.NULL)
            .put("capturedAt", Instant.ofEpochMilli(location.time).toString())
            .put("source", "android_foreground")
            .put("clientKey", "androidfg_" + UUID.randomUUID().toString())
        scope.launch {
            try {
                val current = request(session.origin, session.token, "/me").getJSONObject("account")
                if (!current.optBoolean("recording_enabled", false)) {
                    ForegroundTracking.lastProblem = "Tracking stopped: recording consent was withdrawn on the server."
                    stopSelf()
                    return@launch
                }
                request(session.origin, session.token, "/locations", "POST", payload)
                ForegroundTracking.lastProblem = ""
            } catch (error: IllegalStateException) {
                // The server still enforces consent and may reject an in-flight upload.
                if (error.message?.contains("Enable recording first") == true ||
                    error.message?.contains("Session expired or invalid") == true ||
                    error.message?.contains("Authentication required") == true) {
                    ForegroundTracking.lastProblem = "Tracking stopped: server authorization or consent is no longer valid."
                    stopSelf()
                } else ForegroundTracking.lastProblem = "Location upload failed; it was not queued."
            } catch (_: Exception) {
                // Never print positions, credentials or response bodies to Android logs.
                // This initial foreground preview does not persist or retry failed fixes.
                ForegroundTracking.lastProblem = "A tracking update failed. Offline fixes are not queued yet."
            }
        }
    }

    override fun onProviderDisabled(provider: String) {
        ForegroundTracking.lastProblem = "Tracking stopped: location provider disabled."
        stopSelf()
    }

    override fun onDestroy() {
        if (subscribed) {
            try { manager?.removeUpdates(this) } catch (_: Exception) { }
            subscribed = false
        }
        scope.cancel()
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
