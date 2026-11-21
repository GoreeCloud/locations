# Operator security and recovery runbook (development alpha)

**Status:** This document is a release gate and a checklist, not proof of a production
deployment, independently tested backups, or continuous monitoring. GoreeCloud Locations
stores precise personal movement history and is not an emergency or safety service.

## Roles and authority

- **GoreeShield** governs consent, data minimization, retention and disclosure. Recording
  and sharing remain opt-in. A device may stop participating without circle-owner approval.
- **Wardveil** governs host hardening, incident response, vulnerability handling and
  account/session compromise. It cannot weaken privacy defaults.
- **GoreeCloud Identity** will own interoperable SSO/OIDC when separately implemented;
  current passwords and opaque sessions are local-only.
- **GoreeCloud Mesh** will own future transport/integration contracts; no automatic
  third-party sync is enabled by installing this development service.
- **GoreeCloud UI** governs accessible controls and recording/consent visibility.

## Before any network exposure

1. Clone at an reviewed, pinned Git commit. Inspect Compose, Dockerfiles, dependency
   lockfile and latest CI results; use a private, disposable test environment first.
2. Create an untracked `.env` based on `.env.example`, secure permissions (`chmod 600
   .env`) and generate two **independent** cryptographically strong credentials. Never
   use repository example values. Do not put `.env` in a support bundle.
3. Run `node --env-file=.env scripts/verify-config.mjs`. This read-only check rejects
   missing or obviously weak example values, URL-breaking database passwords,
   malformed ports and non-HTTPS cross-origin access. It **does not** validate
   randomness, credentials at rest, firewall state or certificates.
4. Keep the database and API on private Docker networks. The default web port is
   loopback-bound and appropriate only for access from that machine. **Do not**
   publish the API, database or raw HTTP web listener to the public network.
5. Use a separately configured HTTPS reverse proxy with a valid certificate,
   strict upstream Host routing, minimum TLS version, HSTS only once end-to-end HTTPS
   is verified, redirect HTTP to HTTPS, set request-body limits and redact
   request URIs/coordinates/auth headers from logs. Check the effective headers,
   CORS, Referrer-Policy, CSP, HSTS and forbidden origins using a real browser.
   Do not preload HSTS or open public ingress before verifying safe recovery.
6. Protect host accounts, SSH keys and container engine permissions. Harden access,
   patch OS/runtime images, pin reviewed supply-chain inputs and restrict network egress
   where applicable. Obtain a real Wardveil review before calling this secure.
7. Verify password reset/account recovery and GoreeCloud Identity roadmap; the local
   alpha has no OIDC, MFA or complete anti-brute-force coordination across replicas.
   Ensure users know sign-out revokes the active token and the Privacy page can revoke
   other sessions.
8. Review Android foreground-service controls on a **consenting** dedicated test
   device: notification visibility and Stop behavior, permission revocation, location
   services off, battery saver, network loss, sign-out, account erasure, and startup
   after process death. No covert tracking or unsolicited device installation.

## Private backups and restore gates

- PostgreSQL holds precise **unencrypted-at-database-layer** position data. Establish
  private encrypted backups before any production data, protect backup keys separately,
  and validate access to both key and archive before considering recovery available.
- Use an encrypted, integrity-checked off-host backup destination with an independently
  tested rotation and retention policy. Do not copy plaintext `pg_dump` archives into
  world-readable paths, issue trackers, CI artifacts, screenshots or public GitHub.
- Restore into a **disposable separate database** with synthetic data first. Independently
  verify schema, PostGIS spatial extension, account isolation, location constraints,
  session/token handling and application behavior. Then document a controlled
  disaster-recovery rehearsal with real authorized secrets and data **without** exposing
  private contents in reports.
- The CI script `scripts/smoke-postgis-restore.sh` proves only a synthetic archive
  round-trip using ephemeral PostGIS, **not** operational backup readiness.
- Document retention for historic backups: deleting account history from live PostGIS
  does not guarantee immediate erasure of encrypted backup copies. Minimize retention
  and communicate expiration and recovery procedures clearly.

## Operational verification and rollback

- Run `npm ci && npm run check && npm audit --omit=dev --audit-level=high`.
  Run the isolated PostGIS integration suite with `TEST_DATABASE_URL` pointed
  **only** at local `/locations_test`; it refuses other URLs.
- Run Docker web/API/database smoke and synthetic restore smoke using the repository
  scripts. Require `web-and-api`, `android` and `container-smoke` on the protected
  GitHub `main` branch. Read back the checks and the merged commit.
- Establish monitored disk space, database space, TLS expiry, startup failures, auth
  errors, request rate limits and private backup success. Never put coordinates,
  token values, invitation URLs or login passwords in observability pipelines.
- Keep a pinned prior release, database-compatible rollback plan, secure backup, and
  a staged migration rehearsal. Schema changes can be irreversible; a Git revert
  alone cannot restore user data.
- In a potential leak, restrict ingress, revoke sessions/credentials, preserve
  minimal secure forensic evidence, assess affected users and rotate secrets.
  Report security flaws privately, not with sensitive payloads in public issues.
- Revalidate after every changed upstream image, native app release or proxy rule.
  Until real HTTPS, hardware, restore, access-control and privacy tests pass,
  label the service **development alpha**, not production-ready.

## Explicit limitations

There is no verified public TLS host, validated off-host backup/recovery, full
threat-model certification, Android physical-device acceptance, durable encrypted
offline location queue, emergency escalation, or comprehensive abuse-safety review.
Refer to `docs/ROADMAP.md` and GitHub issues for pending acceptance work.
