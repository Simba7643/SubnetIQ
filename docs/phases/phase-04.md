# Phase 04: REST API, secured lookups, and provider contracts

## Delivered implementation

`apps/api/src/app.ts` exports `createApp(options)` for production and dependency-injected testing. `apps/api/src/server.ts` loads environment files, validates configuration, starts Express, bounds inbound timeouts, and drains connections during shutdown. The API exposes 39 documented operations across 28 paths in `docs/api.openapi.yaml`.

The implementation includes health/readiness, deterministic calculations, projects, atomic revision/restore operations, immutable shared snapshots, saved calculations, favorites, profile/preferences, feedback, practice grading/statistics/history, conversations/messages, account export, and account deletion. Successful writes return real database results. With no Supabase configuration, guest mathematics, lookup routes, and the labeled assistant demo remain usable; protected operations return `SERVICE_UNAVAILABLE`.

## Authentication and ownership

The API verifies each supplied access token through Supabase Auth `getUser`, then creates a database client using the public project key and that same bearer token. It never treats a decoded JWT or browser session object as proof of identity. Ordinary project, calculation, conversation, favorite, and profile operations retain RLS. Request bodies cannot override ownership fields.

The service key is limited to server duties: atomic quotas, shared cache, token-based snapshot resolution, authoritative quiz writes, AI usage accounting, guest feedback, and verified-owner account deletion. Quiz answers are reconstructed from the deterministic generator or the curated bank before grading; caller-supplied correctness is rejected. The database independently enforces composite child/owner relationships and derived statistics.

Supabase requests use a ten-second fetch deadline. A failed authentication service returns a service error; an invalid or expired token returns 401. The implementation follows [Supabase's verified user API](https://supabase.com/docs/reference/javascript/auth-getuser).

## Project and share behavior

Project updates require an expected version and use `mutate_project`. The database captures the previous snapshot and updates the project atomically. `restore_project` uses the same version check and preserves the replaced state. Stale versions return 409.

Shares use 256-bit random URL-safe tokens. Only SHA-256 hashes are stored. The database captures the current project as an immutable snapshot; metadata and snapshot reads never expose token hashes. Expiration and revocation are checked before every public read. Responses use `no-store`; public share responses also use `no-referrer`.

Account export reads all owned tables in bounded pages, removes share hashes, and returns JSON. The interactive limit is 25 MiB or 50,000 rows per table; an oversized account fails explicitly rather than receiving a silently incomplete export. Account deletion removes objects under the verified UUID prefix in both private Storage buckets, purges the user's operational quota subject, then deletes the Auth account and its cascading database records. Partial cleanup failures are reported with retry guidance.

## Lookup boundary

DNS accepts a name plus A, AAAA, MX, TXT, NS, CNAME, or PTR. PTR also accepts an individual IP and converts it to a reverse name. Queries go only to the configured Cloudflare DNS-over-HTTPS origin. Returned names, URLs, and addresses are displayed as data and are never fetched. Response records retain retrieval time, DNS status, TTLs, source, and cache status. This transport follows [Cloudflare's DoH API](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/).

IP information accepts one valid IPv4/IPv6 address. The API fetches the corresponding IANA bootstrap registry, finds the longest matching prefix, and permits only the five reviewed regional registry origins. The selection model follows [RFC 9224](https://www.rfc-editor.org/rfc/rfc9224.html).

For every HTTPS lookup, the service resolves the approved hostname, rejects nonpublic and mixed public/private results, and pins the selected validated address into the actual socket lookup. TLS still verifies the approved hostname. Automatic redirects, credentials in URLs, unapproved origins/ports, encoded response bodies, oversized responses, and excessive concurrency are rejected. There is a deadline across resolution and response receipt. DNS results cache according to their bounded TTL, RDAP records for one hour, and bootstrap data for one day.

The optional legacy WHOIS fallback is disabled by default. When enabled, it can contact only the selected RIR's fixed WHOIS hostname on TCP port 43; queries are validated IP addresses, no shell is used, response size/time are bounded, and referrals are not followed. The returned result identifies this unencrypted legacy transport.

## Quotas, headers, and logs

The default development store is bounded process memory. Production requires PostgreSQL quota RPCs, a service key, a stable secret of at least 32 characters, and HTTPS origins. This requirement makes quota increments atomic across API instances. Subjects are HMAC digests; ordinary logs do not contain IP addresses, tokens, email addresses, request bodies, DNS questions, share tokens, or chat contents.

The default quotas are 180 API requests/minute per IP, 90 calculations/minute, 30 combined lookups/minute, 60 share resolutions/minute, five feedback submissions/hour, and 30 assistant attempts/day per authenticated user or guest identity. `Retry-After` and rate-limit headers expose the relevant reset interval. Trusted proxy hops must match the deployment topology; the default is zero.

Helmet provides security headers. CORS uses an explicit origin list and does not use cookie credentials. JSON bodies are limited to 512 KiB, except project POST/PATCH requests, which permit a 2.25 MiB envelope with a separately enforced 2 MiB plan limit matching the database and import UI. Error responses use a shared code/message/request-ID envelope and do not return raw upstream or database errors. All API responses default to `Cache-Control: no-store`.

## Verification completed

The API compiles with TypeScript strict mode. Four Jest/Supertest suites pass, totaling 56 tests at this phase checkpoint. Tests cover guest mode, errors, content/body limits, the bounded project-body exception, CORS, valid/invalid calculations, missing/invalid authentication, actual Supabase client token propagation using mocked HTTP responses, RLS-context preservation for updates, stale versions, share hashing, lookup validation/failures, public/private address boundaries, mixed-address resolution, approved destinations, reverse DNS, TTL/cache expiry, bootstrap selection, quotas, SSE parsing, deterministic demo output, OpenAI event/usage handling, provider errors, cancellation, and environment gates.

The OpenAI adapter is implemented and covered with provider-protocol fixtures. No live provider key, hosted Supabase deployment, public resolver integration, or native Docker deployment was available for this phase's tests. Those integrations therefore remain configuration-dependent validation, not recorded successes. Database policy tests and their execution environment are documented separately in Phase 03.

## Files and operation

Use `apps/api/.env.example` and the root environment guide. From the repository root, run the workspace API development script after installing dependencies. The compiled entry is `apps/api/dist/server.js`. A deployed filesystem must retain `data/quiz-bank.json` beside the workspace tree because authoritative curated quiz grading reads that file. The browser uses the same shared network engine and generated-question implementation as the API.
