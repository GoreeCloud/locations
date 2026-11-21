# Security policy

This is an alpha development project and not a production safety or emergency service. Report potential vulnerabilities privately via GitHub Security Advisories for `GoreeCloud/locations`; never include secrets, live personal locations or exploitation data in public issues.

## Threat assumptions

Host and database operators can read unencrypted data at rest. Deploy only behind HTTPS with an encrypted database backup and trustworthy reverse proxy. Avoid tracking or exposing members without explicit affirmative permission. Default recording and circle sharing are both disabled; a real user must enable recording before data is accepted. API token hashes are stored at rest, but stolen raw tokens give access until session expiry or logout.

## Security development requirements

- No hard-coded cloud API credentials or private keys. Use uncommitted environment secrets.
- Do not start the service with example credentials.
- Do not publish PostgreSQL ports or expose the development API without TLS.
- Keep full URL/query/body logging disabled for the private location API.
- Maintain authenticated rate limits and positive consent for new background/location features.
- Run `npm test`, `npm run build`, Android build and GitHub CI before release.
- Complete database restore, denial-of-access, invitation expiry, account privacy, dependency and physical-device tests before production.
- Use the [operator readiness and recovery checklist](docs/OPERATIONS.md) and read-only `scripts/verify-config.mjs` preflight; neither is a replacement for verified TLS, encrypted off-host backups or independent security acceptance.
