# GoreeCloud Locations — Features

This registry distinguishes implemented **source-level functionality** from planned features. A passing build or test does **not** establish production readiness, device acceptance, or emergency-service reliability.

## Implemented development-source features

| Area | Capability | Verification boundary |
| --- | --- | --- |
| Web | Responsive React dashboard for overview, history, circles, and privacy settings | Web production build and CI; no independent browser accessibility certification |
| Map | MapLibre latest-position markers; optional public OpenStreetMap raster tiles | External tile requests require an affirmative browser toggle; no offline maps |
| Web location | User-initiated one-time browser geolocation check-in | Requires explicit server recording consent and secure browser context |
| Android | Native Kotlin + Jetpack Compose client, login, recent-position lists, circles, per-circle sharing, privacy controls | Debug APK builds; no verified physical-device usability/permission acceptance |
| Android location | Foreground-only, user-initiated one-time Android location check-in | No background location permission, service, polling, or passive transmission |
| Server identity | Owner bootstrap with server secret, invitation-only account registration, scrypt passwords, opaque bearer sessions | Local implementation only; not integrated with GoreeCloud Identity / OIDC / MFA |
| Consent | Recording disabled by default; per-circle sharing disabled by default and controlled by each member | Server enforces individual consent and member scoping; full adversarial review remains |
| History | PostgreSQL/PostGIS position records with ISO capture time, accuracy, source, bounded list queries and last-known positions | Isolated real-database tests and production restore are separate acceptance gates |
| Personal control | Configurable 1–365-day retention, GeoJSON export (up to 50,000 points), erase all saved points | Deleted points can remain in independently controlled backups until their retention expires |
| Circles | Create circle, owner-generated single-use 24-hour invitation, join/leave (non-owner), member listing and sharing settings | Circle ownership transfer/deletion and advanced administration not yet supported |
| Imports | Original GeoJSON/Dawarich-compatible point importer and Traccar REST route-report importer | Interoperability scripts, **not** an embedded upstream Dawarich or Traccar service |
| Delivery | Reproducible npm workspace, Dockerfiles, Compose, API tests, Android Gradle wrapper, GitHub Actions | Alpha development source; no supported production deployment |

## Planned or incomplete capabilities

- Consent-first Android continuous tracking, persistent opt-in foreground-service notification, prominent pause/stop, safe offline queue and idempotent replay.
- Accurate native map, improved trip visualization, history filters and durable, paginated export.
- Dawarich-style stays, routes, trip segmentation, history analysis and local-first spatial insights.
- Traccar device-protocol ingestion, device identity and token isolation, validated provenance and separate upstream licensing obligations.
- Optional geofences and arrival/departure alerts with independent member consent, anti-stalking controls and GoreeCloud Notify/Mesh contracts.
- Family safety experiences that clearly distinguish stale positions, geolocation error and voluntary sharing; no emergency reliability claim.
- Personal account deletion and circle lifecycle management, session inventory/revocation, OIDC/MFA and hardened API token management.
- Audited encrypted backups, disaster-recovery rehearsals, private map-tile hosting, real-world device acceptance and public TLS deployment.

See [objectives](OBJECTIVES.md), [roadmap](ROADMAP.md), [architecture](ARCHITECTURE.md), and [privacy](PRIVACY.md). Implementation and validation status must remain evidence-based.
