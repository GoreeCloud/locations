# Roadmap and acceptance criteria

Status as of initial development source, not promised delivery dates.

| Priority | Capability | Acceptance gate |
| --- | --- | --- |
| P0 | Owner bootstrap, login, self-controlled recording, history, privacy deletion | Real PostgreSQL integration tests and secure authentication review |
| P0 | Consent-scoped family circles and invite join | Cross-account negative authorization tests, consent revocation tests |
| P0 | Web map and native Android check-in | Android assembleDebug plus physical foreground permission tests; browser map and keyboard/a11y review |
| P0 | Reproducible CI & source code licensing | Valid clean builds, wrapper verification, license and upstream attribution readback |
| P1 | Stable secure remote hosting | Synthetic Docker smoke for startup/proxy/private access is a development CI gate; still requires verified HTTPS, encrypted backups with restore, host-network acceptance and deployment hardening |
| P1 | Continuous tracking (opt-in) | Native foreground service with persistent Stop notification has an initial implementation; still requires physical-device battery/permission validation, encrypted offline queue, and anti-abuse acceptance |
| P1 | Visits and trips (Dawarich-style) | Initial personal read-only heuristic trip summaries exist; remaining acceptance: privacy-preserving visit/stay grouping, map matching, PostGIS trip analysis and real-world validation |
| P1 | Geofences and arrival/departure | Explicit per-person consent, per-circle granular controls, no covert notifications |
| P1 | Vehicle and GPS-device tracking (Traccar-style) | Audited Traccar device-protocol bridge with scoped auth, licensing compatibility and abuse controls |
| P2 | Family safety features | Distress opt-in, fake location/stale-state clarity, anti-stalking UX and harm minimization |
| P2 | Offline Android queue | Local encrypted storage, bounded retry, deletion semantics and key lifecycle tests |
| P2 | GoreeCloud MIPS | Verified API contracts and scoped identity, privacy, Wardveil, Mesh and UI acceptance |

A screenshot, passing compile or development container is not a production deployment. This project has no production credentials, hosts, or data.
