# GoreeCloud Locations — Features

This registry distinguishes implemented **source-level functionality** from planned features. A passing build or test does **not** establish production readiness, device acceptance, or emergency-service reliability.

## Implemented development-source features

| Area | Capability | Verification boundary |
| --- | --- | --- |
| Web | Responsive React dashboard for overview, history, circles, and privacy settings | Web production build and CI; no independent browser accessibility certification |
| Map | MapLibre latest-position markers; optional public OpenStreetMap raster tiles | External tile requests require an affirmative browser toggle; no offline maps |
| Web location | User-initiated one-time browser geolocation check-in | Requires explicit server recording consent and secure browser context |
| Android | Native Kotlin + Jetpack Compose client, login, recent-position lists, circles, per-circle sharing, privacy controls | Debug APK builds; no verified physical-device usability/permission acceptance |
| Android location | User-initiated one-time check-in and opt-in Android foreground location service with persistent Stop notification | Foreground service samples while active; not verified on physical hardware, no boot restart or background-location permission, and no durable offline queue |
| Server identity | Owner bootstrap with server secret, invitation-only account registration, scrypt passwords, opaque bearer sessions | Local implementation only; not integrated with GoreeCloud Identity / OIDC / MFA |
| Consent | Recording disabled by default; per-circle sharing disabled by default and controlled by each member | Server enforces individual consent and member scoping; full adversarial review remains |
| History | PostgreSQL/PostGIS position records with ISO capture time, accuracy, source, bounded list queries and last-known positions | Isolated real-database tests and production restore are separate acceptance gates |
| Trip estimates | Personal, read-only route summaries using deterministic local distance and time heuristics | Web History summary and account-only API; not map-matched navigation, geofencing, or verified arrival evidence |
| Personal control | Configurable 1–365-day retention, backward-compatible GeoJSON export (up to 50,000 points), additional cursor-paged GeoJSON export, erase history, and password-confirmed account deletion | Export remains account-scoped; previously backed-up data may remain until backup expiry; owned shared circles must be explicitly deleted first |
| Circles | Create circle, owner-generated single-use 24-hour invitation, join/leave (non-owner), member listing, sharing settings and explicit owner deletion | Circle deletion revokes membership and invitations, not members' personal history; ownership transfer and advanced administration remain planned |
| Imports | GeoJSON/Dawarich-compatible and Traccar REST importers with deterministic account-scoped retry keys | No upstream Traccar/Dawarich code embedded; repeated identical points from these importers are skipped, while keyless manual check-ins remain append-only |
| Delivery | Reproducible npm workspace, Dockerfiles, Compose, API tests, Android Gradle wrapper, GitHub Actions | Alpha development source; no supported production deployment |

## Planned or incomplete capabilities

- Complete Android foreground-tracking real-device battery, permission revocation, standby, notification controls, and safe encrypted offline queue with idempotent replay; the initial opt-in foreground-service implementation is still an alpha preview.
- Accurate native map, improved trip visualization, history filters and durable, paginated export.
- Dawarich-style stays, routes, trip segmentation, history analysis and local-first spatial insights.
- Traccar device-protocol ingestion, device identity and token isolation, validated provenance and separate upstream licensing obligations.
- Optional geofences and arrival/departure alerts with independent member consent, anti-stalking controls and GoreeCloud Notify/Mesh contracts.
- Family safety experiences that clearly distinguish stale positions, geolocation error and voluntary sharing; no emergency reliability claim.
- Personal account deletion and circle lifecycle management, session inventory/revocation, OIDC/MFA and hardened API token management.
- Audited encrypted backups, disaster-recovery rehearsals, private map-tile hosting, real-world device acceptance and public TLS deployment.

See [objectives](OBJECTIVES.md), [roadmap](ROADMAP.md), [architecture](ARCHITECTURE.md), and [privacy](PRIVACY.md). Implementation and validation status must remain evidence-based.
