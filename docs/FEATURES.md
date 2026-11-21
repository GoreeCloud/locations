# GoreeCloud Locations — Features

This registry distinguishes implemented **source-level functionality** from planned features. A passing build or test does **not** establish production readiness, device acceptance, or emergency-service reliability.

## Implemented development-source features

| Area | Capability | Verification boundary |
| --- | --- | --- |
| Web | Responsive React dashboard for overview, history, circles, and privacy settings | Web production build and CI; no independent browser accessibility certification |
| Map | MapLibre latest-position markers; optional public OpenStreetMap raster tiles | External tile requests require an affirmative browser toggle; no offline maps |
| Web location | User-initiated one-time browser geolocation check-in | Requires explicit server recording consent and secure browser context |
| Android | Native Kotlin + Jetpack Compose client, login, recent-position lists, circles, per-circle sharing, privacy controls | Debug APK builds; no verified physical-device usability/permission acceptance |
| Android location | User-initiated check-in and opt-in foreground service with persistent Stop; bounded in-memory queue, maximum three network attempts, stale/inaccurate-fix filtering and periodic consent/notification-permission checks | Not physically validated; no boot restart, background-location permission, encrypted durable offline queue, or guaranteed delivery |
| Server identity | Owner bootstrap, invitation-only registration, scrypt passwords, opaque bearer sessions, active-session listing and password-confirmed sign-out of other sessions | Local implementation only; not integrated with GoreeCloud Identity / OIDC / MFA; device/user-agent metadata not collected |
| Consent | Recording disabled by default; per-circle sharing disabled by default and controlled by each member | Server enforces individual consent and member scoping; full adversarial review remains |
| History | PostgreSQL/PostGIS records with bounded private list queries and an account-only radius API; the web History view offers an explicit coordinate/radius search with results limited to the signed-in person's fixes | Backend cross-account denial and web input-validation unit tests; no geofencing, map-tile request, attendance or shared-visit disclosure |
| Trip estimates | Personal, read-only route summaries using deterministic local distance and time heuristics | Web History summary and account-only API; not map-matched navigation, geofencing, or verified arrival evidence |
| Visit estimates | Private, read-only cluster/stay estimates from own stored timestamps, coordinates and GPS accuracy | Web History and owner-only API; no POI attribution, notifications, geofences, attendance or safety claims |
| Private saved places | Account-only PostgreSQL named places with optional fixed radius, 25-place cap, private list/create and name-confirmed deletion REST endpoints | API-level functionality with synthetic PostGIS isolation/concurrency tests; no Android/web place-edit UI yet, geofence alerts, background evaluation or circle visibility |
| Personal control | Configurable 1–365-day retention, 50k one-shot export, bounded cursor-paged GeoJSON API, and a private local export CLI with exclusive mode-0600 output; erase history and password-confirmed account deletion | Export never returns other accounts' records; previously backed-up data may remain until backup expiry; owned shared circles must be explicitly deleted first |
| Circles | Create circle, owner-generated single-use 24-hour invitation, join/leave (non-owner), member listing, sharing settings and explicit owner deletion | Circle deletion revokes membership and invitations, not members' personal history; ownership transfer and advanced administration remain planned |
| Imports | GeoJSON/Dawarich-compatible and Traccar REST importers with deterministic account-scoped retry keys, bounded 64 MiB sources and guarded 250-point request batches | No upstream Traccar/Dawarich code embedded; secure HTTPS destination or local loopback required and redirects rejected; keyless manual check-ins remain append-only |
| Delivery | Reproducible npm workspace, Dockerfiles, Compose, API tests, Android Gradle wrapper, GitHub Actions and read-only operator configuration preflight | Alpha development source; no verified TLS/recovery/hardware acceptance or supported production deployment |

## Planned or incomplete capabilities

- Complete Android foreground-tracking real-device battery, permission revocation, standby, notification controls, and safe encrypted offline queue with idempotent replay; the initial opt-in foreground-service implementation is still an alpha preview.
- Accurate native map, improved trip visualization, history filters and browser-native streaming export; the CLI supports paged personal GeoJSON without holding the complete export in memory.
- Advanced Dawarich-style visit classification, map matching, visit editing/labels, route segmentation and richer history analysis beyond initial private heuristic trip and stay estimates.
- Traccar device-protocol ingestion, device identity and token isolation, validated provenance and separate upstream licensing obligations.
- Optional geofences and arrival/departure alerts with independent member consent, anti-stalking controls and GoreeCloud Notify/Mesh contracts.
- Family safety experiences that clearly distinguish stale positions, geolocation error and voluntary sharing; no emergency reliability claim.
- Advanced circle ownership transfer and invitation administration, device-scoped token lifecycle, OIDC/MFA, audit visibility and hardened identity integration beyond the implemented account deletion and session-revocation controls.
- Production-validated encrypted/off-site backups and restore rehearsals, private map-tile hosting, real-world device acceptance and public TLS deployment; synthetic container recovery testing alone is insufficient.

See [objectives](OBJECTIVES.md), [roadmap](ROADMAP.md), [architecture](ARCHITECTURE.md), and [privacy](PRIVACY.md). Implementation and validation status must remain evidence-based.
