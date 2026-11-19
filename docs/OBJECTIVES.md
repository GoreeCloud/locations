# GoreeCloud Locations — Objectives

## Product mission

Build an original, self-hosted and privacy-first family location and personal history system, combining useful workflow concepts from Dawarich, Traccar and Life360 without covert tracking or copying proprietary software.

It must preserve each person's control over recording and sharing, ownership and portability of their data, and trustworthy presentation of stale or unavailable location information.

## Product objectives and acceptance criteria

1. **Informed, reversible consent.** Do not record, share, or notify about location without explicit, individually controlled authorization. Withdrawals must take effect in server authorization logic and clearly explain what previously stored information remains.
2. **Complete data ownership.** Support account-scoped export and deletion, documented retention and encrypted, restorable backups with expiry and lifecycle controls.
3. **One interoperable self-hosted service.** Offer a secure API, first-party web app, and native Android app from the same public repository. Maintain platform and privacy independence during outages.
4. **Useful history.** Preserve accurate timestamps, locations, trips, visits and geofences as separate tested capabilities, never imply planned analysis exists already.
5. **Opt-in family circles.** Membership and invitation must never equal consent to reveal positions. Make revocation and leaving straightforward and safe.
6. **Safe hardware integrations.** Accept compatible Traccar and other device-position formats only after protocol review, source attribution, authentication, quotas, safety and abuse prevention.
7. **Security and reliability.** Protect high-sensitivity data through least privilege, TLS, audited authentication, isolation, hardened containers, CI, independent threat modeling and restore testing before a production label.
8. **GoreeCloud ecosystem alignment.** Treat GoreeShield as privacy authority, Wardveil as cybersecurity authority, GoreeCloud Mesh as integration coordinator, GoreeCloud UI as design system and GoreeCloud Identity as authentication/authorization authority when a tested integration exists.
9. **Maintainable open source.** Clearly attribute original and third-party work, honor Apache-2.0 and separately licensed resources, use reviewed pull requests and reproducible builds, and publish honest feature-status documentation.

## Present readiness boundary

The repository currently provides an alpha source baseline and synthetic validation only. It has **not** established continuous background tracking, production restore, stable public hosting, physical-device acceptance, emergency response reliability, or any broad GoreeCloud MIPS integration. Those require independent evidence before release.

See [features](FEATURES.md), [roadmap](ROADMAP.md), and [security](../SECURITY.md).
