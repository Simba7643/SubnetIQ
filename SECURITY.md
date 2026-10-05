# Security policy

## Reporting

Report suspected vulnerabilities privately to the operator or repository maintainer through its published security/contact channel. This source release does not invent a maintainer email address. Include the affected version, a minimal authorized reproduction, expected and observed behavior, and the likely impact. Do not include tokens, passwords, unrelated personal data, or proof obtained from systems you do not control.

Avoid opening a public exploit report before the maintainer has had a reasonable opportunity to investigate. The maintainer should acknowledge reports and agree on disclosure timing based on severity and remediation progress.

## Security model

- All private REST routes verify a Supabase bearer token and retain user-scoped RLS access.
- Cross-owner relationships are constrained in the database as well as the API.
- Project shares contain immutable snapshots and hashed high-entropy tokens, with expiry and revocation.
- Remote lookup transports validate hosts and addresses, pin connections, reject redirects, bound output, and time out.
- Production quotas use atomic PostgreSQL functions and a stable secret-derived subject key.
- Password/hash inputs stay in the browser and are excluded from normal result persistence and analytics.
- AI context is bounded and recomputed by the deterministic engine. Provider instructions do not authorize infrastructure changes.
- Service credentials never belong in frontend variables, logs, commits, or download archives.

See `docs/security-model.md` for table policies, service functions, storage paths, and residual boundaries.

## Operator responsibilities

Apply migrations and dependency updates deliberately. Configure HTTPS, exact CORS origins, trusted proxy hops, secret rotation, email/OAuth providers, backups, and retention. Keep the public site URL and Auth redirect list aligned. Review cloud-specific reservations and firewall drafts against the target environment.

The release is tested locally as recorded in `docs/verification.md`. Embedded PostgreSQL tests do not prove hosted Auth/OAuth behavior, external email delivery, upstream availability, or concurrent production traffic. Run those launch gates on the configured deployment.
