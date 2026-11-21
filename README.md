# GoreeCloud Locations

**Self-hosted location history, trusted circles and on-demand device check-ins.** A native-first, privacy-led alternative inspired by the useful workflows of Dawarich, Traccar and Life360, built with original GoreeCloud code and open-source components.

> **Status: 0.1.0-alpha.0 development source. Not a Life360-equivalent emergency or production service.** A user-started Android foreground tracking preview exists, but device acceptance, durable offline tracking, geofences, and family safety notifications are not established. No production deployment or signed release APK is claimed.

## Included now

- **Web** — React/Vite dashboard, MapLibre map, opted-in OpenStreetMap map tiles, personal history, check-in, GeoJSON export, history erase, circles and invites, privacy controls.
- **Android** — Kotlin + Jetpack Compose native client, current positions and history list, on-demand check-in and user-started foreground tracking with Stop notification. It has bounded in-memory buffering/retries, periodic consent checks, and filters inaccurate/stale fixes; **no persisted offline queue**, boot auto-start or background-location permission. Physical-device behavior is not yet accepted.
- **API** — Node 22 HTTP REST, locally authenticated owner + invitation-only accounts, scrypt password storage, short-lived invitation tokens and 30-day opaque sessions. The web Privacy tab can list active session timestamps and password-confirm revocation of all other sessions.
- **Database** — PostgreSQL 17/PostGIS, private account tracks, circle membership, explicit opt-in sharing, bounded retention and spatial index. A read-only personal PostGIS radius API and an explicit web History form support nearby past check-in queries without sharing data with circle members or external geocoders; coordinates are sent in authenticated JSON bodies, never URL query strings.
- **Trips and visits** — offline deterministic estimates of journeys and likely stays from your own stored samples, visible in the web History tab; no map matching, geocoding, attendance proof, arrival alerts, or automatic sharing.
- **Private saved places** — account-scoped API plus a web History management panel for up to 25 owner-defined named places and radii, with explicit deletion. Places can provide a search center but are never included in circle visibility and do not enable automatic geofence monitoring. Android place editing remains planned.
- **Interop** — GeoJSON (Dawarich-style) importer, Traccar REST route report importer, GeoJSON export. No upstream Traccar/Dawarich code copied.
- **DevOps** — all configs, Dockerfiles, Compose, migrations, test and CI workflows stored here. Successful GitHub Actions runs publish a 7-day web build preview and an **unsigned-for-release, debug-signed Android test APK** under workflow artifacts, not as production releases.

## Get started (self-hosted development)

Prerequisites: Git, Compose-compatible container engine, Node.js >=22 (for local web/API), and Android Studio/JDK17 for native builds.

1. Clone the repo, then copy `.env.example` to `.env`.
2. Generate **independent, strong random** secrets for `POSTGRES_PASSWORD` and `BOOTSTRAP_TOKEN`; the placeholders must never be deployed. Generate the database password as URL-safe hex or base64url because the API constructs a PostgreSQL connection URI. Verify the private file before startup with `node --env-file=.env scripts/verify-config.mjs` (Node 22+) or `npm run check:config` with exported environment variables; the preflight prints no secret contents and does not certify deployment safety.
3. Run `docker compose up --build` or `podman compose up --build` **with a compatible Compose provider installed**. Podman alone does not include a Compose provider. Container images use explicit registry paths to work with rootless Podman.
4. Open `http://localhost:8080` **on the same computer only**; select **First setup** and create your first owner account with the bootstrap token.
5. Go to **Privacy**, explicitly enable recording, and click **Check in now** to request browser foreground location.
6. Create a circle and generate a 24-hour, single-use invitation. New members still have recording and circle sharing disabled. They enable these independently.

PostGIS health checks use TCP on `127.0.0.1` inside the database container; Unix sockets may become ready during the temporary initialization server before API-to-database TCP is available. A separate, synthetic-only schema backup-and-restore rehearsal runs via `CONTAINER_ENGINE=docker bash scripts/smoke-postgis-restore.sh`, verifies PostgreSQL and PostGIS extension restoration, and deletes its temporary container/database archive. It does **not** establish encrypted production backup, off-host redundancy, user data protection or operational recovery readiness.

The disposable container smoke is available via `CONTAINER_ENGINE=docker bash scripts/smoke-containers.sh` (or `podman` on a properly configured bridge). It builds the web and API images, starts a temporary PostGIS database on a private container network with no host volume, then checks web HTTP 200, API health HTTP 200 and unauthenticated privacy HTTP 401 before removing all test containers and network. Older rootless Podman CNI setups may lack inter-container DNS or bridge routing and fail independently of Docker; install a supported networking backend before using Compose there.

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

The Android app uses a user-provided HTTPS server address. Foreground tracking is *opt-in each app process*, requires recording consent plus foreground location and notification permission, sends a fix only when movement or the OS delivers an update, and offers a persistent Stop notification. Sign-out or disabling recording stops the service. It does **not** request background-location permission, restart on boot, or persist offline fixes after the service stops. It may retry up to three attempts while active; a bounded 64-fix RAM channel rejects **new** fixes when full and visibly counts dropped fixes. The service uses cancellation-aware HTTP for consent verification and upload to avoid blocking Stop behind a synchronous response. Stop/sign-out attempts to cancel active transport calls; any request already accepted by the server may still commit, so server recording consent remains authoritative. Debug builds can target a local HTTP emulator host. The web client holds session tokens in RAM (reload signs out), not localStorage.

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

Imports use deterministic per-point client keys, so resubmitting identical normalized points from the same importer is idempotent for an account. Other location writes without client keys remain append-only. Import CLIs enforce 64 MiB source limits, bounded 250-point uploads, request timeouts, no HTTP redirects, and HTTPS for API endpoints except explicit loopback HTTP. Traccar reports also require HTTPS and bounded response parsing. These are input safeguards, not proof of secure upstream server operation. Review files before upload; imported timestamps and source coordinates remain sensitive. Limit and format constraints are documented in [API](docs/API.md).

## Export your complete location history

The web dashboard's one-shot export has a 50,000-position limit. For larger personal histories, the local-first CLI reads the account-only paged API with bounded memory, writes a mode-0600 temporary file and publishes the final GeoJSON only after every page succeeds. It **never overwrites** an existing destination and removes partial exports on errors.

Set `EXPORT_API_TOKEN` from your secret manager rather than typing a sensitive token into shell history. Set `API_URL` to your private HTTPS endpoint (plain HTTP is accepted only on loopback). Then run:

```sh
npm run export:geojson -- /path/to/private/locations.geojson
```

Optional `EXPORT_PAGE_SIZE` (1–5,000; default 3,000) and `EXPORT_MAX_POINTS` (1–5,000,000; default 2,000,000) bound API and disk usage. Protect the output and private backups: precise location histories can reveal people's homes and routines. Export reads can differ from a fixed snapshot if your history changes during downloading.

## Privacy-first operation

- Recording **off** at account creation. No automatic background collection. Android foreground tracking starts only from a visible user action and shows a persistent Stop notification.
- Sharing **off** when a circle is created or joined. Circle membership alone does not reveal tracks; sharing is set by the individual.
- No analytics SDK or cloud location tracking. Optional public map tiles are disabled until actively enabled in the browser.
- Default retention **30 days**, configurable 1–365 days, hourly cleanup.
- User-scoped export, permanently erase saved positions, and password-confirmed permanent account deletion. Circle owners can delete a circle without deleting other members' personal locations.
- Not suitable for life-critical emergency use, covert tracking, or production use without security and recovery review.

See [features](docs/FEATURES.md), [objectives](docs/OBJECTIVES.md), [privacy](docs/PRIVACY.md), [architecture](docs/ARCHITECTURE.md), [API](docs/API.md), [roadmap](docs/ROADMAP.md), [security](SECURITY.md), [operator readiness and recovery](docs/OPERATIONS.md), and [notices](NOTICE.md).

## Licensing

Original code is **Apache License 2.0**. Retained GoreeCloud UI design tokens remain **MIT** licensed. Traccar is Apache-2.0 and Dawarich AGPL-3.0; neither codebase has been transplanted into this repo. GPL/AGPL code must not be casually embedded or relicensed. [Notices and provenance](NOTICE.md).

**MIPS alignment:** GoreeShield owns privacy and consent, Wardveil owns cybersecurity, GoreeCloud Mesh owns integration, GoreeCloud UI owns design, and GoreeCloud Identity will own identity when verifiably integrated. Their named responsibilities are not claims of completed cross-product integrations.
