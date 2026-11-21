# Roadmap and acceptance criteria

Status as of initial development source, not promised delivery dates.

| Priority | Capability | Acceptance gate |
| --- | --- | --- |
| P0 | Owner bootstrap, login, self-controlled recording, history, privacy deletion | Real PostGIS tests cover concurrent bootstrap, session revocation, account deletion, schema constraints, and private history; an independent security review remains required before production |
| P0 | Consent-scoped family circles and invite join | Cross-account negative authorization tests, consent revocation tests |
| P0 | Web map and native Android check-in | Android assembleDebug plus physical foreground permission tests; browser map and keyboard/a11y review |
| P0 | Reproducible CI & source code licensing | Valid clean builds, wrapper verification, license and upstream attribution readback |
| P1 | Stable secure remote hosting | Synthetic Docker HTTP smoke and database backup/restore rehearsal are development CI gates; still requires verified HTTPS, encrypted independent backup with restore, host-network acceptance and deployment hardening |
| P1 | Continuous tracking (opt-in) | Native foreground service with persistent Stop notification has an initial implementation; still requires physical-device battery/permission validation, an account-bound encrypted offline queue and safe replay after restart, backend in-flight request finalization after Stop, and anti-abuse acceptance |
| P1 | Visits and trips (Dawarich-style) | Initial personal read-only heuristic trip and stay summaries exist; remaining acceptance: meaningful verified stay grouping, labels, map matching, PostGIS trip analysis and real-world validation |
| P1 | Geofences and arrival/departure | Explicit per-person consent, per-circle granular controls, no covert notifications |
| P1 | Vehicle and GPS-device tracking (Traccar-style) | Audited Traccar device-protocol bridge with scoped auth, licensing compatibility and abuse controls |
| P2 | Family safety features | Distress opt-in, fake location/stale-state clarity, anti-stalking UX and harm minimization |
| P2 | Offline Android queue | Local encrypted storage, bounded retry, deletion semantics and key lifecycle tests |
| P2 | GoreeCloud MIPS | Verified API contracts and scoped identity, privacy, Wardveil, Mesh and UI acceptance; standalone token session listing/revoke-others is not a replacement for MIPS Identity/OIDC/MFA |

A screenshot, passing compile or development container is not a production deployment. This project has no production credentials, hosts, or data.
