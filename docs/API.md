# GoreeCloud Locations REST API (alpha)

Base path via the web proxy: `/api/v1`. Direct API server local development uses `/v1` on port 8787. Except bootstrap, login, join, health, all calls require `Authorization: Bearer <opaque-token>`. JSON request and response; `Cache-Control: no-store`.

| Method | Route | Purpose and access |
| --- | --- | --- |
| GET | `/healthz` | Database-connected health status (direct server root) |
| POST | `/v1/auth/bootstrap` | Single-use server initialization by bootstrap token, email and password |
| POST | `/v1/auth/login` | Authenticate email/password, return `token`, `expiresAt` |
| POST | `/v1/auth/join` | Register a new account using an invite token |
| POST | `/v1/auth/logout` | Revoke present session |
| GET | `/v1/me` | Current account privacy preferences |
| PATCH | `/v1/privacy` | `recordingEnabled: boolean`, `retentionDays: integer 1..365` |
| POST | `/v1/locations` | Single `latitude`, `longitude`, optional `accuracyM`, `capturedAt`, `source` |
| POST | `/v1/locations/batch` | `{positions: [...]}` up to 500 points, accepted only when recording enabled |
| GET | `/v1/locations?userId=&from=&until=&limit=` | Up to 1000, default 500 recent points from past 30 days, owner or presently consented circle member only |
| GET | `/v1/locations/latest` | Most recent personal and consenting shared member positions |
| GET | `/v1/trips?from=&until=&points=` | Heuristic trip summaries from **current account only**, default prior 30 days/3,000 points, max 10,000. Returns estimated distance/duration, lines and truncation flag |
| GET | `/v1/export/geojson` | Account's personal GeoJSON, limit 50k points, returns 413 if exceeded |
| DELETE | `/v1/me/locations` | Permanently erase all stored points for account |
| GET | `/v1/circles` | Circle membership and own sharing state |
| POST | `/v1/circles` | Create circle with `name`, owner sharing defaults false |
| GET | `/v1/circles/:id/members` | View members when in circle |
| PATCH | `/v1/circles/:id/sharing` | Set **only own** `enabled` sharing for the specified circle |
| POST | `/v1/circles/:id/invites` | Owner creates 24-hour one-use token |
| POST | `/v1/invites/accept` | Existing authenticated user accepts invitation |
| POST | `/v1/circles/:id/leave` | Non-owner exits membership |

## Models and boundaries

Location payloads use WGS84 **latitude -90..90** and **longitude -180..180**, finite JSON numbers; accuracy 0..100000 meters; capture time ISO8601 no more than five minutes ahead and no more than ten years in the past; source 1..32 lowercase/uppercase ASCII letters/numbers/dash/underscore. History defaults to prior 30 days. No access to another person's coordinates without *their* account-level recording and *their* own sharing toggle for a shared circle.

Owner bootstrap requires `BOOTSTRAP_TOKEN` at least 32 characters and safe account password at least 12; signup is invite-only. On browser reload, RAM session is discarded. Avoid sending bearer tokens or any positions in URL query strings, logs, screenshots or public bug reports.

## Import protocols

- GeoJSON importer uses each Point feature's coordinates [longitude, latitude] and one of `capturedAt`, `timestamp`, `time`, `recorded_at`; epoch-ms numeric timestamp accepted. Missing/invalid features are skipped.
- Traccar report adapter calls GET `/api/reports/route?deviceId=...&from=...&to=...` with upstream Basic Auth over HTTPS. It reads Traccar `latitude`, `longitude`, `fixTime` / `deviceTime` / `serverTime`. It never transmits Traccar credentials to GoreeCloud API.

Trip inference uses a deterministic haversine-based heuristic: movements below accuracy thresholds, gaps over 45 minutes, and physically implausible jumps are not considered continuous travel. The response includes `startedAt`, `endedAt`, estimated `distanceMeters`, `durationSeconds`, `pointCount`, a GeoJSON LineString, `sampledPoints`, and `truncated`. It is not a map-matched route, family-sharing endpoint, arrival proof, or safety system.\n\nThe API has no OpenAPI generator yet and is not a stable public contract.
