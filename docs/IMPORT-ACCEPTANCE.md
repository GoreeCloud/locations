# Full application import acceptance

Verified upstream: Freika/dawarich 1.23.0, f6b79c9b826f1d1e1ff7e0e3d7d1b252084dddfe; AGPL-3.0. Exact 4,772-file source checkout and initial derivative changes staged privately on authorized development hardware.

Outstanding gates:
1. Establish component-specific redistribution rights and notices (fonts, map data, map assets, images, JS, fixtures and dependencies). Preserve AGPL and ODbL obligations; verify branding rights.
2. Complete self-host-only mode; no paid tiers or payment-enforced account state, preserve authentication and authorization. Test all accounts, family access and upgrades.
3. Replace upstream default external tiles, glyphs and sprites with private/self-hosted resources. Verify browser/server egress and explicit consent for integrations. Disable donation verification, remote analytics, advertising and release phone-home.
4. Remove known upstream bootstrap password and credential logging; establish private owner enrollment and secure secrets.
5. Build from local source using pinned compatible Ruby 4.0.9, Rails, PostGIS and Redis. Test fresh setup, migration, restore and failure cases in isolation.
6. Adopt verified GoreeCloud UI, Mesh, Identity, GoreeShield and Wardveil contracts without mandatory external services. Preserve privacy/security roles.
7. Protected PR with required CI, dependency and security review, test evidence and source correspondence. No release or deployment until verified.

The current public feature is independent source only. The upstream application is not yet published here.
