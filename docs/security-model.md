# Security model

## Boundaries and ownership

SubnetIQ has a browser application, an Express API, Supabase Auth, PostgreSQL, private Storage, approved network lookup services, and an optional AI provider. Pure subnet calculations run without privileged credentials. The API validates protected bearer tokens through Supabase Auth and supplies the user's access token to the ordinary database client. Database policies enforce ownership even when a user addresses the Supabase Data API directly.

The service client is used for a bounded set of operations: trusted quiz grading persistence, provider usage accounting, lookup caching, atomic request accounting, resolving a share hash, removing Storage objects for account deletion, and the Auth admin deletion operation. Ordinary project, revision, conversation, preference, and favorite requests retain the authenticated user's RLS context. See [the API authentication implementation](../apps/api/src/middleware/auth.ts) and [database grants and policies](../supabase/migrations/20261004000200_ownership_and_history.sql).

`SUPABASE_SERVICE_ROLE_KEY`, AI provider keys, and `RATE_LIMIT_SECRET` belong only in the backend environment. A frontend Supabase publishable/anonymous key is not an ownership credential; the signed-in user's verified token establishes their identity. This design follows Supabase's documented [RLS model](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Access matrix

| Data or operation                 | Guest                                                    | Signed-in owner                              | Other signed-in user        | Application service                              |
| --------------------------------- | -------------------------------------------------------- | -------------------------------------------- | --------------------------- | ------------------------------------------------ |
| Published example templates       | Read                                                     | Read                                         | Read                        | Maintain                                         |
| Projects and saved plans          | No direct access                                         | Own records only                             | No access to another owner  | Administration only                              |
| Revisions                         | No direct access                                         | Read and append own records                  | No access                   | Maintenance                                      |
| Share records and token hashes    | No direct access                                         | Read own records, create/revoke/delete links | No access                   | Resolve one valid hash                           |
| Public snapshot by token          | Through rate-limited API                                 | Through API                                  | Through API                 | Expiry/revocation checked in SQL                 |
| Quiz attempts and practice totals | Current guest session only                               | Read own persisted data                      | No access                   | Record independently graded attempts             |
| AI conversations and messages     | Unsaved demo/live session according to API configuration | Own conversation content                     | No access                   | Provider accounting and administration           |
| AI usage events                   | No access                                                | Read own usage                               | No access                   | Insert usage                                     |
| Private exports and avatars       | No object listing                                        | Own UUID-prefixed paths                      | No access to another prefix | Account cleanup and authorized export generation |
| Lookup cache and quota tables     | No direct access                                         | No direct access                             | No direct access            | Narrow service RPCs                              |

Every public application table enables RLS. User-table policies state both the `USING` condition for visible existing rows and the `WITH CHECK` condition for inserted or replacement rows. Separate table and column grants remove unnecessary operations. Revision and message history cannot be rewritten by the user role. Only `revoked_at` can be updated on a share through that role. Direct user insertion into graded attempts, practice totals, and AI accounting is not granted.

The `private` schema is excluded from the API's exposed schema list. Privileged functions have a fixed empty search path, schema-qualified data access, revoked default execution privileges, a service-only execute grant, and an explicit service-role claim check. The mutation and restore RPCs execute as the caller and verify `auth.uid()` before touching a project. Their shared trigger captures the prior state within the same transaction.

## Relationships and data integrity

Child relationships include the owner ID in their foreign keys. A row owned by User A cannot refer to a project, VLSM plan, or AI conversation owned by User B. Network parents and IPv4/IPv6 pairs also include the project ID. PostgreSQL enforces these relationships independently of application route validation; see the [constraint definitions](../supabase/migrations/20261004000100_core.sql). PostgreSQL's [foreign-key documentation](https://www.postgresql.org/docs/17/ddl-constraints.html) describes this relational enforcement and selective nulling of optional relationship columns.

CIDR columns require canonical network values. Gateways must use the same address family and belong to their network. Child networks strictly fit within their parent; the strict prefix hierarchy prevents cycles. Paired networks use different IP versions. VLSM reservations and allocations fit within their parent, and an allocated locked segment keeps its locked CIDR. Relationship validation locks referenced rows while checking them. Invalid input receives a constraint or validation error.

These checks provide structural integrity. The calculation engine remains responsible for subnet mathematics, capacity policy, overlaps, growth allocation, special-use classification, and explanation traces. JSON stored by its owner is user content and does not become an independently certified network design merely because it passes a database shape check. The API recomputes saved calculation results instead of trusting a submitted result object.

## Concurrent edits and immutable shares

Project updates include an expected version. A successful change records the previous project row, advances the version, and applies the update in one transaction. A stale version returns a conflict, allowing the user to reload and reconcile. Restoring a revision creates another version and retains the displaced state. Revisions contain the complete `projects.plan` value; separately stored normalized child records participate only when represented within that plan.

The API generates a high-entropy share token and stores its SHA-256 hash. On insertion, the database captures the current owned project and removes the top-level owner identifier. The supplied snapshot cannot replace this captured value. A shared snapshot is immutable, expires no later than ninety days after creation, and cannot be reactivated after revocation. The resolver returns the same null result for missing, expired, or revoked hashes. The API sets `Cache-Control: no-store` on private and share responses.

A snapshot includes the project fields and allocation data the user elects to share. A valid link grants read access to that snapshot. Revocation stops future resolver access; it cannot retract content someone already copied, printed, or downloaded.

## Lookup egress

Lookup routes accept validated record names and IP addresses. They do not accept arbitrary upstream URLs. DNS queries use a configured resolver. Returned DNS data is displayed as data rather than fetched recursively. Registration lookups use reviewed RDAP bootstrap origins, and the optional legacy WHOIS path uses fixed destinations and no shell execution.

The transport checks the protocol and approved origin, resolves destinations, rejects disallowed address ranges, pins the selected address for the connection, and rejects automatic redirection. Request deadlines, byte limits, concurrency limits, and bounded cache lifetimes constrain upstream resource use. See [network transport](../apps/api/src/security/network.ts) and [lookup services](../apps/api/src/services/lookups/index.ts). These controls follow the allowlist and destination-validation approach in the [OWASP SSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).

DNS answers that happen to contain private addresses can be useful diagnostic data. They do not authorize a connection from the API to those addresses. WHOIS/RDAP response strings and AI output are rendered as untrusted content.

## Quotas, provider usage, and stored learning results

Production request accounting uses the `consume_api_quota` PostgreSQL function. Its fixed-window bucket key includes subject, scope, window start, and window size. A guarded update consumes the requested cost only when it fits; rejected requests do not increase recorded use. Concurrent API instances therefore share one PostgreSQL accounting store. Development may use an explicitly selected process-local memory store.

The API derives subjects using HMAC-SHA256 with the backend rate-limit secret. Raw client IPs are not stored as quota subjects. The service maintains the secret consistently across instances. Rotating it changes the subject namespace and resets effective accounting for existing callers.

Quiz correctness is derived from the server's original curated or generated question, rather than the client's `correct` field. Only the service can insert the resulting attempt. A transactional trigger increments topic/difficulty totals and streaks. AI usage events similarly require the service; provider-reported or explicitly estimated usage must be represented honestly by the integration.

Provider credentials remain on the server. The AI service bounds input/output, supports cancellation, and sanitizes rendered markdown and links. Calculation attachments are explicit context. Unconfigured or unimplemented providers report their status instead of claiming to have generated live answers.

## Storage and deletion

The exports and avatar buckets are private. Permissions require a first path component equal to the authenticated user's UUID. The restrictive path policy continues to fence these buckets even if another permissive Storage policy is added. Upload and update checks prevent moving an object into a different user's prefix. MIME and size limits are configured per bucket; avatars do not accept SVG.

Signed download URLs are time-limited capabilities and should be generated only after an authorized request. The Storage API serves and deletes objects; SQL alone only manages metadata. Supabase documents these distinctions in [Storage access control](https://supabase.com/docs/guides/storage/security/access-control) and [Storage ownership](https://supabase.com/docs/guides/storage/security/ownership).

Account deletion removes the user's bucket objects before deleting the Auth account, removes its HMAC quota subject, and then relies on database cascades for owned relational data. An interrupted operation returns an explicit partial-failure response so it can be retried. Guest feedback without an account owner has independent operator retention. Operational IP buckets and expired lookup entries can be purged with the service maintenance function; quota windows become eligible seven days after their end.

## Verification and deployment checks

The supplied PostgreSQL suite tests guests, owners, unrelated users, and the service role. It also tests owner forgery, cross-owner foreign keys, private cache access, untrusted grading attempts, stale writes, atomic revisions, restore ownership, snapshot persistence, expiry, irreversible revocation, private Storage path moves, and account cascades. Four additional assertions check seeded IPv4/IPv6 containment, gateway placement, and non-overlap.

All production migrations and 108 assertions passed in PostgreSQL 18.3 through the PGlite 0.5.8 WASM harness. The harness supplies minimal Auth and Storage table/function fixtures while executing the actual application RLS, triggers, constraints, and RPCs. The fixture does not emulate Supabase HTTP authentication or Storage signing. No claim is made that native PostgreSQL 17, multiple database connections, hosted OAuth, provider billing, email delivery, or signed URLs were tested in this environment.

Before deploying, run the native SQL suite with the intended Supabase version and verify the real authentication, callback, email, signed download, CORS, streaming, and production quota configurations. Exercise two simultaneous versioned project writes and concurrent quota requests through separate API/database connections. This is an integration gate for the deployed services, not a substitute for the already executed database policy tests.
