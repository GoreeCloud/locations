# GoreeCloud Locations architecture

## Current implementation (development preview)

- `apps/web`: React 19, Vite, MapLibre GL JS map (no outside tiles by default), desktop/mobile responsive UI. Vendor-pinned GoreeCloud UI CSS token source.
- `apps/api`: Node.js 22 HTTP REST service, scrypt account passwords, 256-bit random opaque bearer sessions, SHA-256-at-rest bearer and invitation tokens, bounded request bodies, constant-time bootstrap comparison and basic memory-bound sign-in throttling. Auth and privacy are enforced on the server, not in clients.
- `migrations`: PostgreSQL 17 + PostGIS models for account-scoped tracks, circles, per-member opt-in sharing and expiring one-use invitations. Spatial GiST index is reserved for later geofences and proximity search.
- `apps/android`: native Kotlin/Jetpack Compose, foreground user-initiated location fix and HTTPS API, RAM-only session.
- `scripts`: portable imported position adapters for GeoJSON/Dawarich exports and Traccar JSON reports; no proprietary Life360 source.

All first-party source, vendored design tokens, builds, container definitions and workflow code are in the same repository.

## Trust model

1. A server requires `BOOTSTRAP_TOKEN` and initializes the first account once under an advisory transaction lock.
2. No anonymous registration. Further accounts require a **single-use, 24h invite** from an existing circle owner; invitations do not enable sharing or recording.
3. Any recorded point is bound exclusively to the authenticated token's owner. Clients cannot supply another account identifier to insert positions.
4. Users must first enable account-level recording. Both new positions and older history remain private by default.
5. A second account may query a member's positions **only** if both accounts currently share a circle, that member explicitly enables circle sharing, and the member has recording enabled. The owner's own history remains accessible to the owner. These checks execute on every API request.
6. A member can withdraw sharing at any time; all per-circle toggles default off, independent of the owner.
7. All endpoints return no-store and avoid logging coordinates/tokens. Private history export and full erasure are account-scoped.
8. Database port is not published; API service is only connected to Compose's internal network. Web binds loopback only until intentionally placed behind HTTPS Gateway.

## Known limitations / acceptance gates

- Not equivalent to Life360: continuous opt-in background tracking, geofences/arrival-departure, distress/SOS, safety escalation, notification delivery, fine-grained contact invitations and anti-abuse features are **not implemented**.
- Not a full Traccar protocol receiver: only Traccar REST route-import adapter; no GPS tracker TCP/UDP device-protocol service imported. Traccar itself is not embedded or running.
- Not a Dawarich fork: GeoJSON interchange and initial deterministic, account-private trip estimates are supported; visit analytics, map matching, heatmaps, AI classification and full Dawarich analysis are not present.
- The server uses a simple initial SQL schema migration; future changes need versioned, transactional migrations.
- Password-confirmed account deletion and owner-confirmed circle deletion are implemented, but session management UI, circle ownership transfer, per-device API tokens, quotas, rate-limit persistence, encryption-at-rest key management, audit logs, backup restore and hardened public deployment remain unimplemented.
- Android shows a native list, not yet a native embedded map. Background collection is intentionally absent.
- Web session is volatile (RAM) and must be reauthenticated on page reload. No remote login cookie by default.
- External OSM tiles are OPTIONAL; tile requests expose the requesting IP to an outside provider. A self-hosted vector tile service is preferred for fully private maps.
- Location data is highly sensitive. This is **not a production release** until penetration review, threat modeling, MFA/Identity integration, Wardveil findings and recovery testing pass.

## Forward platform integration boundaries

- GoreeShield defines privacy and consent contracts. Their enforcement is independent of any future central service.
- GoreeCloud Identity is the future OIDC/login authority; do not treat current local credentials as integrated Identity.
- GoreeCloud Mesh may exchange **explicitly scoped, consented** location events and send notifications, but must not create hidden or broad data-sharing paths.
- Wardveil governs security checks, dependency scanning, incident response, and anti-stalking threat model.
- GoreeCloud UI is the verified design authority for both clients; native UI parity remains independent acceptance work.

## Data recovery

Stop writes and take a consistent `pg_dump` of the PostGIS database; protect it as highly sensitive data with an encrypted backup vault. Restore to a new isolated PostGIS 17 instance and independently verify account counts, permission rows, and retained sample positions without sharing output. Backups of deleted positions require separately governed expiry. **No restore rehearsal has been performed by writing this document.**
