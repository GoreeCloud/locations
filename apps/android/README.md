# Android client

Native Kotlin + Jetpack Compose development client (Android API 26+).

- Sign in to your self-hosted GoreeCloud Locations web origin.
- Explicitly enable/disable recording and per-circle sharing.
- Request foreground location permission only when the user taps Check in.
- Record one current location on demand; no background service, periodic tracking, analytics SDK or location transmission while idle.
- See history, circle membership and last known positions.
- Tokens are held in RAM, and not saved to disk or synced.

## Development

Open apps/android in Android Studio with Android SDK 35 and JDK 17. Run `./gradlew :app:assembleDebug`.

The API base is the same web origin, e.g. `https://locations.example.com`. The client calls `/api/v1/...`, so it requires the included reverse-proxy setup or an equivalent route. Release blocks cleartext HTTP. The debug build permits HTTP only to localhost / 127.0.0.1 / 10.0.2.2 for emulator development.

GPS fix retrieval uses foreground location only, and will fail safely when Android denies permission or no provider is available. No Android notification or geofencing automation is yet implemented.

The project's branding uses the verified GoreeCloud UI alpha colors; native UI component parity and device acceptance require later validation.
