package com.goreecloud.locations

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.time.Instant
import java.util.concurrent.TimeUnit

private val http = OkHttpClient.Builder().followRedirects(false).callTimeout(20, TimeUnit.SECONDS).build()
private val brand = Color(0xFF5146C8)
private val lightSurface = Color(0xFFF6F7FB)
internal data class Session(val origin: String, val token: String)
private enum class Screen(val label: String) { HOME("Home"), HISTORY("History"), CIRCLES("Circles"), PRIVACY("Privacy") }

internal fun validateOrigin(text: String): String {
    val input = text.trim().trimEnd('/')
    val uri = try { URI(input) } catch (_: Exception) { throw IllegalArgumentException("Invalid server URL") }
    val host = uri.host ?: throw IllegalArgumentException("Server hostname required")
    val local = host in setOf("localhost", "127.0.0.1", "10.0.2.2")
    require(uri.scheme == "https" || (BuildConfig.DEBUG && local && uri.scheme == "http")) {
        "HTTPS is required (HTTP is allowed for local debug only)"
    }
    require(uri.userInfo == null && uri.fragment == null && uri.query == null && (uri.path.isNullOrEmpty() || uri.path == "/")) {
        "Enter the web origin without credentials, path, query, or fragment"
    }
    return input
}
internal fun request(origin: String, token: String?, path: String, method: String = "GET", json: JSONObject? = null): JSONObject {
    val url = validateOrigin(origin) + "/api/v1" + path
    val builder = Request.Builder().url(url).header("Accept", "application/json")
    if (token != null) builder.header("Authorization", "Bearer $token")
    val payload = json?.toString()?.toRequestBody("application/json; charset=utf-8".toMediaType())
    builder.method(method, if (method == "GET") null else payload ?: ByteArray(0).toRequestBody("application/json".toMediaType()))
    http.newCall(builder.build()).execute().use { response ->
        val bytes = response.body?.string() ?: "{}"
        val data = try { JSONObject(bytes) } catch (_: Exception) { JSONObject() }
        if (!response.isSuccessful) throw IllegalStateException(data.optString("error", "Request failed: ${response.code}"))
        return data
    }
}
private fun currentLocation(activity: ComponentActivity, success: (Location) -> Unit, failure: (String) -> Unit) {
    val manager = activity.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    val provider = when {
        manager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
        manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
        else -> { failure("Enable device location services to check in."); return }
    }
    try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            manager.getCurrentLocation(provider, CancellationSignal(), ContextCompat.getMainExecutor(activity)) { fix ->
                if (fix != null) success(fix) else failure("No current location fix available.")
            }
        } else {
            @Suppress("DEPRECATION")
            manager.requestSingleUpdate(provider, object : LocationListener {
                override fun onLocationChanged(location: Location) = success(location)
                override fun onProviderDisabled(name: String) = failure("Location provider disabled.")
                override fun onProviderEnabled(name: String) {}
                @Deprecated("Deprecated in Android")
                override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            }, null)
        }
    } catch (_: SecurityException) { failure("Location permission was denied.") }
    catch (_: Exception) { failure("Unable to acquire a location fix.") }
}
private fun JSONArray.objects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }
private fun JSONObject.text(key: String): String = optString(key, "")
private fun JSONObject.bool(key: String): Boolean = optBoolean(key, false)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { NativeLocations(this) }
    }
}

@Composable
private fun NativeLocations(activity: ComponentActivity) {
    val dark = isSystemInDarkTheme()
    val scheme = if (dark) darkColorScheme(
        primary = Color(0xFFBFB8FF), onPrimary = Color(0xFF272057),
        background = Color(0xFF0D121D), surface = Color(0xFF171D2A),
        onSurface = Color(0xFFF2F4FB), onBackground = Color(0xFFF2F4FB)
    ) else lightColorScheme(
        primary = brand, onPrimary = Color.White, background = lightSurface,
        surface = Color.White, onSurface = Color(0xFF1B2030), onBackground = Color(0xFF1B2030)
    )
    var session by remember { mutableStateOf<Session?>(null) }
    MaterialTheme(colorScheme = scheme) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            if (session == null) Login(onLogin = { session = it })
            else Workspace(activity, session!!, onLogout = { session = null })
        }
    }
}

@Composable
private fun Login(onLogin: (Session) -> Unit) {
    val scope = rememberCoroutineScope()
    var origin by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(26.dp), verticalArrangement = Arrangement.Center) {
        Text("◎", fontSize = 55.sp, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(14.dp))
        Text("GoreeCloud Locations", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text("Stay connected. Stay in control.", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(12.dp))
        Text("Sign in to your private server. No background location collection is enabled.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(27.dp))
        OutlinedTextField(origin, { origin = it }, label = { Text("Server address (HTTPS)") }, placeholder = { Text("https://locations.example.com") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(email, { email = it }, label = { Text("Email") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(password, { password = it }, label = { Text("Password") }, visualTransformation = PasswordVisualTransformation(), singleLine = true, modifier = Modifier.fillMaxWidth())
        if (error.isNotEmpty()) { Spacer(Modifier.height(10.dp)); Text(error, color = MaterialTheme.colorScheme.error) }
        Spacer(Modifier.height(18.dp))
        Button(
            onClick = {
                busy = true; error = ""
                scope.launch {
                    try {
                        val valid = validateOrigin(origin)
                        val login = withContext(Dispatchers.IO) {
                            request(valid, null, "/auth/login", "POST", JSONObject().put("email", email).put("password", password))
                        }
                        onLogin(Session(valid, login.getString("token")))
                    } catch (e: Exception) { error = e.message ?: "Sign-in failed" }
                    finally { busy = false }
                }
            }, enabled = !busy && origin.isNotBlank() && email.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth()
        ) { Text(if (busy) "Signing in…" else "Sign in") }
        Spacer(Modifier.height(20.dp))
        Text("Create the owner account or accept a first-time invitation from the web app. Session tokens stay in memory only.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun Workspace(activity: ComponentActivity, session: Session, onLogout: () -> Unit) {
    val scope = rememberCoroutineScope()
    var screen by remember { mutableStateOf(Screen.HOME) }
    var account by remember { mutableStateOf(JSONObject()) }
    var circles by remember { mutableStateOf(emptyList<JSONObject>()) }
    var latest by remember { mutableStateOf(emptyList<JSONObject>()) }
    var history by remember { mutableStateOf(emptyList<JSONObject>()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    suspend fun refresh() {
        val snapshot = withContext(Dispatchers.IO) {
            listOf(
                request(session.origin, session.token, "/me"),
                request(session.origin, session.token, "/circles"),
                request(session.origin, session.token, "/locations/latest"),
                request(session.origin, session.token, "/locations?limit=100")
            )
        }
        account = snapshot[0].getJSONObject("account")
        circles = snapshot[1].getJSONArray("circles").objects()
        latest = snapshot[2].getJSONArray("positions").objects()
        history = snapshot[3].getJSONArray("positions").objects()
    }
    fun runAction(action: suspend () -> Unit) {
        busy = true; error = ""; message = ""
        scope.launch {
            try { action() }
            catch (e: Exception) { error = e.message ?: "Request failed" }
            finally { busy = false }
        }
    }
    LaunchedEffect(session) {
        try { refresh() } catch (e: Exception) { error = e.message ?: "Cannot connect" }
    }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { permissions ->
        if (permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true || permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true) {
            currentLocation(activity, success = { fix ->
                runAction {
                    withContext(Dispatchers.IO) {
                        request(session.origin, session.token, "/locations", "POST", JSONObject()
                            .put("latitude", fix.latitude).put("longitude", fix.longitude)
                            .put("accuracyM", fix.accuracy.toDouble())
                            .put("capturedAt", Instant.ofEpochMilli(fix.time).toString())
                            .put("source", "android"))
                    }
                    refresh(); message = "Check-in saved privately."
                }
            }, failure = { error = it })
        } else error = "Location access was not granted."
    }
    val trackerPermissions = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        val allowed = granted[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            granted[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (allowed && account.bool("recording_enabled")) {
            ForegroundTracking.session = session
            try {
                ContextCompat.startForegroundService(activity,
                    Intent(activity, ForegroundTrackingService::class.java).setAction(ForegroundTrackingService.START))
                message = "Foreground tracking requested. The notification provides a Stop control."
            } catch (_: Exception) {
                ForegroundTracking.session = null
                error = "Android could not start foreground location tracking."
            }
        } else error = "Location permission and recording consent are required."
    }
    val trackerNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { allowed ->
        if (allowed) trackerPermissions.launch(
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        else error = "Notification permission is required to make tracking visible. No tracking started."
    }
    Scaffold(
        topBar = {
            Surface(shadowElevation = 2.dp) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Column {
                        Text("◎  GoreeCloud Locations", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                        Text("Private workspace", style = MaterialTheme.typography.labelSmall)
                    }
                    TextButton(onClick = {
                        runAction {
                            // End location collection before the network sign-out request.
                            activity.stopService(Intent(activity, ForegroundTrackingService::class.java))
                            ForegroundTracking.session = null
                            try { withContext(Dispatchers.IO) { request(session.origin, session.token, "/auth/logout", "POST", JSONObject()) } }
                            finally { onLogout() }
                        }
                    }) { Text("Sign out") }
                }
            }
        },
        bottomBar = {
            NavigationBar {
                Screen.entries.forEach { item ->
                    NavigationBarItem(selected = item == screen, onClick = { screen = item },
                        icon = { Text(when(item) { Screen.HOME -> "◉"; Screen.HISTORY -> "◷"; Screen.CIRCLES -> "◎"; Screen.PRIVACY -> "◇" }) },
                        label = { Text(item.label) })
                }
            }
        }
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(18.dp)) {
            if (error.isNotEmpty()) {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                    Text(error, Modifier.padding(14.dp), color = MaterialTheme.colorScheme.onErrorContainer)
                }
                Spacer(Modifier.height(10.dp))
            }
            if (message.isNotEmpty()) {
                Card { Text(message, Modifier.padding(14.dp)) }
                Spacer(Modifier.height(10.dp))
            }
            when (screen) {
                Screen.HOME -> {
                    Heading("Location overview", "Latest visible positions. Not a continuous live feed.")
                    InfoCard {
                        Text(if (account.bool("recording_enabled")) "● Recording allowed" else "○ Recording off", color = MaterialTheme.colorScheme.primary)
                        Text("Check-in only runs when you tap the button. It may request foreground location permission.", style = MaterialTheme.typography.bodySmall)
                        Spacer(Modifier.height(10.dp))
                        Button(
                            enabled = !busy && account.bool("recording_enabled"),
                            onClick = {
                                val fine = ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                                val coarse = ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                                if (fine || coarse) {
                                    currentLocation(activity, success = { fix ->
                                        runAction {
                                            withContext(Dispatchers.IO) {
                                                request(session.origin, session.token, "/locations", "POST", JSONObject()
                                                    .put("latitude", fix.latitude).put("longitude", fix.longitude)
                                                    .put("accuracyM", fix.accuracy.toDouble())
                                                    .put("capturedAt", Instant.ofEpochMilli(fix.time).toString())
                                                    .put("source", "android"))
                                            }
                                            refresh(); message = "Check-in saved privately."
                                        }
                                    }, failure = { error = it })
                                } else launcher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                            }
                        ) { Text("◎ Check in now") }
                        Spacer(Modifier.height(12.dp))
                        Text("Optional foreground tracking", fontWeight = FontWeight.Bold)
                        Text("Only after you start it, recent accurate fixes may upload while other apps are open. A persistent notification offers Stop. Network errors get limited in-memory retries (max 64 queued); no offline storage, boot restart or guaranteed delivery.", style = MaterialTheme.typography.bodySmall)
                        if (ForegroundTracking.running) {
                            Text("● Foreground tracking active", color = MaterialTheme.colorScheme.primary)
                            Button(onClick = {
                                activity.stopService(Intent(activity, ForegroundTrackingService::class.java))
                                ForegroundTracking.session = null
                                message = "Tracking stopped."
                            }) { Text("Stop foreground tracking") }
                        } else {
                            OutlinedButton(enabled = !busy && account.bool("recording_enabled"), onClick = {
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                                    ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                                    trackerNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
                                } else {
                                    trackerPermissions.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                                }
                            }) { Text("Start foreground tracking") }
                        }
                        if (ForegroundTracking.lastProblem.isNotBlank()) {
                            Text(ForegroundTracking.lastProblem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                        }
                        if (!account.bool("recording_enabled")) Text("Enable recording in Privacy first.", style = MaterialTheme.typography.bodySmall)
                    }
                    Spacer(Modifier.height(16.dp))
                    Heading("Last known locations", "Only members who enable circle sharing become visible.")
                    if (latest.isEmpty()) Text("No positions are visible.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    latest.forEach { p ->
                        InfoCard {
                            Text(if (p.text("user_id") == account.text("id")) "You" else p.text("email"), fontWeight = FontWeight.Bold)
                            Text("${p.optDouble("latitude")}, ${p.optDouble("longitude")}", style = MaterialTheme.typography.bodyMedium)
                            Text(p.text("captured_at"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                }
                Screen.HISTORY -> {
                    Heading("Your timeline", "Up to 100 recent positions from the last 30 days.")
                    if (history.isEmpty()) Text("No history saved.")
                    history.forEach { p ->
                        InfoCard {
                            Text(p.text("captured_at"), fontWeight = FontWeight.Bold)
                            Text("${p.optDouble("latitude")}, ${p.optDouble("longitude")}")
                            Text("Source: ${p.text("source")}", style = MaterialTheme.typography.bodySmall)
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                }
                Screen.CIRCLES -> {
                    Heading("Trusted circles", "Each member decides whether to share.")
                    circles.forEach { c ->
                        InfoCard {
                            Text(c.text("name"), fontWeight = FontWeight.Bold)
                            Text("Your role: ${c.text("role")}", style = MaterialTheme.typography.bodySmall)
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("Share in this circle", modifier = Modifier.weight(1f))
                                Switch(checked = c.bool("sharing_enabled"), enabled = !busy, onCheckedChange = { enabled ->
                                    runAction {
                                        withContext(Dispatchers.IO) {
                                            request(session.origin, session.token, "/circles/${c.text("id")}/sharing", "PATCH", JSONObject().put("enabled", enabled))
                                        }
                                        refresh()
                                    }
                                })
                            }
                        }
                        Spacer(Modifier.height(10.dp))
                    }
                    if (circles.isEmpty()) Text("Create or join circles from the web dashboard.")
                    Text("Circle invitations and membership management are available in the web app.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Screen.PRIVACY -> {
                    Heading("Your privacy controls", "GoreeShield: only you can authorize recording and sharing.")
                    InfoCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("Record location history", fontWeight = FontWeight.Bold)
                                Text("Off by default", style = MaterialTheme.typography.bodySmall)
                            }
                            Switch(checked = account.bool("recording_enabled"), enabled = !busy, onCheckedChange = { enabled ->
                                runAction {
                                    if (!enabled) {
                                        activity.stopService(Intent(activity, ForegroundTrackingService::class.java))
                                        ForegroundTracking.session = null
                                    }
                                    withContext(Dispatchers.IO) {
                                        request(session.origin, session.token, "/privacy", "PATCH", JSONObject().put("recordingEnabled", enabled))
                                    }
                                    refresh()
                                }
                            })
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    InfoCard {
                        Text("History retention: ${account.optInt("retention_days",30)} days", fontWeight = FontWeight.Bold)
                        Text("Choose a retention limit:", style = MaterialTheme.typography.bodySmall)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf(7, 30, 90).forEach { day ->
                                OutlinedButton(enabled = !busy, onClick = {
                                    runAction {
                                        withContext(Dispatchers.IO) {
                                            request(session.origin, session.token, "/privacy", "PATCH", JSONObject().put("retentionDays",day))
                                        }
                                        refresh()
                                    }
                                }) { Text("${day}d") }
                            }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    InfoCard {
                        Text("Erase your stored positions", fontWeight = FontWeight.Bold)
                        Text("This cannot be undone. Account and circle membership remain.", style = MaterialTheme.typography.bodySmall)
                        var confirm by remember { mutableStateOf(false) }
                        if (confirm) {
                            Button(enabled = !busy, onClick = {
                                runAction {
                                    val result = withContext(Dispatchers.IO) { request(session.origin,session.token,"/me/locations","DELETE",JSONObject()) }
                                    refresh(); message = "Deleted ${result.optInt("deleted",0)} positions."; confirm = false
                                }
                            }) { Text("Confirm permanent deletion") }
                            TextButton(onClick = { confirm = false }) { Text("Cancel") }
                        } else {
                            OutlinedButton(onClick = { confirm = true }) { Text("Delete all history") }
                        }
                    }
                }
            }
            Spacer(Modifier.height(26.dp))
            Text("GoreeCloud Locations · Alpha preview · Foreground tracking only after your explicit start", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
@Composable private fun Heading(title: String, subtitle: String) {
    Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
    Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Spacer(Modifier.height(16.dp))
}
@Composable private fun InfoCard(content: @Composable ColumnScope.() -> Unit) {
    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
    }
}
