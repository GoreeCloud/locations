# GoreeCloud Locations

**Self-hosted location history, trusted circles and on-demand device check-ins.** A native-first, privacy-led alternative inspired by the useful workflows of Dawarich, Traccar and Life360, built with original GoreeCloud code and open-source components.

> **Status: 0.1.0-alpha.0 development source. Not a Life360-equivalent emergency or production service.** No continuously running tracking, geofencing or family safety notifications are implemented yet. No production deployment or signed Android APK is claimed.

## Included now

- **Web** — React/Vite dashboard, MapLibre map, opted-in OpenStreetMap map tiles, personal history, check-in, GeoJSON export, history erase, circles and invites, privacy controls.
- **Android** — Kotlin + Jetpack Compose native client, current positions and history list, explicit foreground check-in, per-circle sharing and account recording/retention controls.
- **API** — Node 22 HTTP REST, locally authenticated owner + invitation-only accounts, scrypt password storage, short-lived invitation tokens and 30-day opaque sessions.
- **Database** — PostgreSQL 17/PostGIS, private account tracks, circle membership, explicit opt-in sharing, bounded retention and spatial index.
- **Trips** — offline deterministic estimates of journeys from your stored position samples, visible in the web History tab; no map matching, geocoding, arrival inference, or automatic tracking.
- **Interop** — GeoJSON (Dawarich-style) importer, Traccar REST route report importer, GeoJSON export. No upstream Traccar/Dawarich code copied.
- **DevOps** — all configs, Dockerfiles, Compose, migrations, test and CI workflows stored here. Successful GitHub Actions runs publish a 7-day web build preview and an **unsigned-for-release, debug-signed Android test APK** under workflow artifacts, not as production releases.

## Get started (self-hosted development)

Prerequisites: Git, Compose-compatible container engine, Node.js >=22 (for local web/API), and Android Studio/JDK17 for native builds.

1. Clone the repo, then copy `.env.example` to `.env`.
2. Generate **independent, strong random** secrets for `POSTGRES_PASSWORD` and `BOOTSTRAP_TOKEN`; the placeholders must never be deployed. Generate the database password as URL-safe hex or base64url because the API constructs a PostgreSQL connection URI.
3. Run `docker compose up --build` or `podman compose up --build` **with a compatible Compose provider installed**. Podman alone does not include a Compose provider. Container images use explicit registry paths to work with rootless Podman.
4. Open `http://localhost:8080` **on the same computer only**; select **First setup** and create your first owner account with the bootstrap token.
5. Go to **Privacy**, explicitly enable recording, and click **Check in now** to request browser foreground location.
6. Create a circle and generate a 24-hour, single-use invitation. New members still have recording and circle sharing disabled. They enable these independently.

Compose binds only loopback (`127.0.0.1:8080`); the API and database aren't exposed on host networking. Use a reverse proxy with verified TLS and access control before any network access, and never expose a production setup token. Browser geolocation generally requires a secure origin (localhost is a special local context). For Android device testing, use a real HTTPS hostname that routes `/api` to the service.

## Develop locally

```sh
npm ci
npm run dev:api    # configure DATABASE_URL and BOOTSTRAP_TOKEN first; listens 8787
npm run dev:web    # in another shell; http://127.0.0.1:5173
npm test
npm run build
cd apps/android && ./gradlew :app:assembleDebug
```

The Android app uses a user-provided HTTPS server address and does not request background access. Debug builds can target a local HTTP emulator host. The web client holds session tokens in RAM (reload signs out), not localStorage.

## Import an existing location history

Consent: your signed-in account must first enable recording. `IMPORT_API_TOKEN` is the current signed-in user's token, not an admin bypass.

GeoJSON point FeatureCollection (including compatible Dawarich exports, when timestamp properties are present):

```sh
IMPORT_API_TOKEN='...' API_URL='http://localhost:8080/api' \
  node scripts/import-geojson.mjs exported.geojson
```

Traccar route reports (no Traccar credentials sent to GoreeCloud API):

```sh
TRACCAR_URL=https://traccar.example.org TRACCAR_USERNAME=user TRACCAR_PASSWORD='...' \
TRACCAR_DEVICE_ID=1 IMPORT_FROM=2026-11-01T00:00:00Z IMPORT_TO=2026-11-02T00:00:00Z \
IMPORT_API_TOKEN='...' API_URL=http://localhost:8080/api \
  node scripts/import-traccar.mjs
```

Imports are append-only and not yet deduplicated. Review files before upload. Limit and format constraints are documented in [API](docs/API.md).

## Privacy-first operation

- Recording **off** at account creation. No background collection.
- Sharing **off** when a circle is created or joined. Circle membership alone does not reveal tracks; sharing is set by the individual.
- No analytics SDK or cloud location tracking. Optional public map tiles are disabled until actively enabled in the browser.
- Default retention **30 days**, configurable 1–365 days, hourly cleanup.
- User-scoped export, permanently erase saved positions, and password-confirmed permanent account deletion. Circle owners can delete a circle without deleting other members' personal locations.
- Not suitable for life-critical emergency use, covert tracking, or production use without security and recovery review.

See [features](docs/FEATURES.md), [objectives](docs/OBJECTIVES.md), [privacy](docs/PRIVACY.md), [architecture](docs/ARCHITECTURE.md), [API](docs/API.md), [roadmap](docs/ROADMAP.md), [security](SECURITY.md), and [notices](NOTICE.md).

## Licensing

Original code is **Apache License 2.0**. Retained GoreeCloud UI design tokens remain **MIT** licensed. Traccar is Apache-2.0 and Dawarich AGPL-3.0; neither codebase has been transplanted into this repo. GPL/AGPL code must not be casually embedded or relicensed. [Notices and provenance](NOTICE.md).

**MIPS alignment:** GoreeShield owns privacy and consent, Wardveil owns cybersecurity, GoreeCloud Mesh owns integration, GoreeCloud UI owns design, and GoreeCloud Identity will own identity when verifiably integrated. Their named responsibilities are not claims of completed cross-product integrations.
