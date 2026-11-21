# GoreeCloud Locations REST API (alpha)

Base path via the web proxy: `/api/v1`. Direct API server local development uses `/v1` on port 8787. Except bootstrap, login, join, health, all calls require `Authorization: Bearer <opaque-token>`. JSON request and response; `Cache-Control: no-store`.

| Method | Route | Purpose and access |
| --- | --- | --- |
| GET | `/healthz` | Database-connected health status (direct server root) |
| POST | `/v1/auth/bootstrap` | Single-use server initialization by bootstrap token, email and password |
| POST | `/v1/auth/login` | Authenticate email/password, return `token`, `expiresAt` |
| POST | `/v1/auth/join` | Register a new account using an invite token |
| POST | `/v1/auth/logout` | Revoke present session |
| GET | `/v1/me/sessions` | List up to 100 own active session IDs, created/expiry timestamps and current flag; no bearer tokens returned |
| POST | `/v1/me/sessions/revoke-others` | Password-confirmed revocation of other sessions for the account; current session remains; returns revoked count |
| GET | `/v1/me` | Current account privacy preferences |
| GET | `/v1/me/places` | List up to 25 private named places owned exclusively by the authenticated account; **never exposed to circles** |
| POST | `/v1/me/places` | Create private place from JSON body `{name, latitude, longitude, radiusMeters?}` (default 125 m; 50–5,000 m, at most 25 places per account). No coordinate URLs, geocoding, tracking or notifications |
| DELETE | `/v1/me/places/:id` | Delete own named place only, requiring JSON `{confirmName: "exact place name"}`; other accounts receive 404 |
| PATCH | `/v1/privacy` | `recordingEnabled: boolean`, `retentionDays: integer 1..365` |
| POST | `/v1/locations` | Single `latitude`, `longitude`, optional `accuracyM`, `capturedAt`, `source` |
| POST | `/v1/locations/batch` | `{positions: [...]}` up to 500 points, accepted only when recording enabled; optional `clientKey` per point provides account-scoped idempotency. Response returns `accepted` inserted and `duplicates` skipped |
| GET | `/v1/locations?userId=&from=&until=&limit=` | Up to 1000, default 500 recent points from past 30 days, owner or presently consented circle member only |
| POST | `/v1/locations/nearby` | **Current account only**. Send JSON body `{latitude, longitude, radiusMeters?, from?, until?, limit?}` (coordinates as finite numbers, never in URL). PostGIS geography radius search with meter distances, 1,000 m default/max 25,000 m; 30-day/200-point defaults, max 1,000 results. No circle delegation, external geocoding or query-string location leakage |
| GET | `/v1/locations/latest` | Most recent personal and consenting shared member positions |
| GET | `/v1/trips?from=&until=&points=` | Heuristic trip summaries from **current account only**, default prior 30 days/3,000 points, max 10,000. Returns estimated distance/duration, lines and truncation flag |
| GET | `/v1/visits?from=&until=&points=` | Read-only personal stay estimates based on bounded coordinate clusters, gaps and accuracy. Defaults prior 30 days/3,000 points, max 10,000 points; up to 300 visits with `truncated` flag. No shared-circle or third-party access |
| GET | `/v1/export/geojson` | Backward-compatible personal GeoJSON, limit 50k points; returns 413 and points to paged export for larger histories |
| GET | `/v1/export/geojson/page?limit=&beforeId=` | Account-only stable descending-ID GeoJSON pages (default 1,000, max 5,000); returns FeatureCollection, `hasMore`, and nullable `nextBeforeId`. Follow cursor until null; the repository's `npm run export:geojson -- <file>` CLI writes a protected local file |
| DELETE | `/v1/me/locations` | Permanently erase all stored points for account |
| DELETE | `/v1/me` | Permanently delete authenticated account, own positions and sessions; requires `password` and `confirmation: "DELETE ACCOUNT"`; refuses while owned circles have other members |
| GET | `/v1/circles` | Circle membership and own sharing state |
| POST | `/v1/circles` | Create circle with `name`, owner sharing defaults false |
| GET | `/v1/circles/:id/members` | View members when in circle |
| PATCH | `/v1/circles/:id/sharing` | Set **only own** `enabled` sharing for the specified circle |
| POST | `/v1/circles/:id/invites` | Owner creates 24-hour one-use token |
| POST | `/v1/invites/accept` | Existing authenticated user accepts invitation |
| POST | `/v1/circles/:id/leave` | Non-owner exits membership |
| DELETE | `/v1/circles/:id` | Owner only: remove circle membership/invites but not other people's personal histories; requires exact `confirmName` |

## Models and boundaries

Location payloads use WGS84 **latitude -90..90** and **longitude -180..180**, finite JSON numbers; accuracy 0..100000 meters; capture time ISO8601 no more than five minutes ahead and no more than ten years in the past; source 1..32 lowercase/uppercase ASCII letters/numbers/dash/underscore. History defaults to prior 30 days. No access to another person's coordinates without *their* account-level recording and *their* own sharing toggle for a shared circle.

Owner bootstrap requires `BOOTSTRAP_TOKEN` at least 32 characters and safe account password at least 12; signup is invite-only. On browser reload, RAM session is discarded. Avoid sending bearer tokens or any positions in URL query strings, logs, screenshots or public bug reports.

## Import protocols

The repository's GeoJSON and Traccar import CLIs accept at most 64 MiB of input JSON, at most 200,000 features per invocation, and upload in 250-point batches. Both enforce API_URL using HTTPS or loopback HTTP only, reject endpoint redirects, and use bounded network timeouts and response parsing. Traccar report requests require HTTPS and have a separate 45-second deadline. These importer checks do not replace authenticated server consent, cross-account protection, or safe data provenance.

- GeoJSON importer uses each Point feature's coordinates [longitude, latitude] and one of `capturedAt`, `timestamp`, `time`, `recorded_at`; epoch-ms numeric timestamp accepted. Missing/invalid features are skipped.
- Traccar report adapter calls GET `/api/reports/route?deviceId=...&from=...&to=...` with upstream Basic Auth over HTTPS. It reads Traccar `latitude`, `longitude`, `fixTime` / `deviceTime` / `serverTime`. It never transmits Traccar credentials to GoreeCloud API.

Personal visit estimates require several accurate location fixes remaining within approximately 125 m for at least 10 minutes, without logging gaps over 45 minutes. Each estimate returns its approximate center, first/last nearby fix times, duration, number of fixes and observed sample radius. This is self-only retrospective analysis, **not** proof of presence, a geofence notification, or emergency assistance.\n\nTrip inference uses a deterministic haversine-based heuristic: movements below accuracy thresholds, gaps over 45 minutes, and physically implausible jumps are not considered continuous travel. The response includes `startedAt`, `endedAt`, estimated `distanceMeters`, `durationSeconds`, `pointCount`, a GeoJSON LineString, `sampledPoints`, and `truncated`. It is not a map-matched route, family-sharing endpoint, arrival proof, or safety system.\n\nThe API has no OpenAPI generator yet and is not a stable public contract.
