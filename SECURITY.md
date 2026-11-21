# Security policy

This is an alpha development project and not a production safety or emergency service. Report potential vulnerabilities privately via GitHub Security Advisories for `GoreeCloud/locations`; never include secrets, live personal locations or exploitation data in public issues.

## Threat assumptions

Host and database operators can read unencrypted data at rest. Deploy only behind HTTPS with an encrypted database backup and trustworthy reverse proxy. Avoid tracking or exposing members without explicit affirmative permission. Default recording and circle sharing are both disabled; a real user must enable recording before data is accepted. API token hashes are stored at rest, but stolen raw tokens give access until session expiry or logout.

## Security development requirements

- No hard-coded cloud API credentials or private keys. Use uncommitted environment secrets.
- First-owner bootstrap and invitation-only account creation issue the first bearer session **in the same PostgreSQL transaction** as account creation. If the session insertion fails, the account, invitation use, and membership creation roll back together; retry is possible.
- Do not start the service with example credentials.
- Do not publish PostgreSQL ports or expose the development API without TLS.
- Keep full URL/query/body logging disabled for the private location API.
- Maintain authenticated rate limits and positive consent for new background/location features. Auth endpoints have a bounded, per-process per-network-peer limiter and a separate hashed-email or account limiter for password attempts. **This is not a distributed limiter**: deploy a trusted reverse-proxy/edge limiter across replicas and validate legitimate multi-user behavior behind that proxy. Do not trust user-controlled X-Forwarded-For for rate-limit identity.
- Run import scripts only with credentials from a secure environment. Their network calls reject redirects and require encrypted remote API endpoints; never embed a private token in API_URL. Import limits reduce resource risk but do not validate source data integrity or guarantee upstream trust.
- Run `npm test`, `npm run build`, Android build and GitHub CI before release.
- Complete database restore, denial-of-access, invitation expiry, account privacy, dependency and physical-device tests before production.
- Use the [operator readiness and recovery checklist](docs/OPERATIONS.md) and read-only `scripts/verify-config.mjs` preflight; neither is a replacement for verified TLS, encrypted off-host backups or independent security acceptance.
