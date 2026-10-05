# Phase 3 — Supabase schema, policies, and persistence

## Delivered

This phase includes three ordered SQL migrations, a complete local Supabase configuration, four reusable seeded network examples, a native-compatible SQL security suite, and a portable PostgreSQL WASM runner.

The schema contains sixteen public application tables and two private service tables. User ownership is enforced with RLS and composite foreign keys. Signup creates a bounded profile. Project edits use optimistic versions with transactional history; restore retains the state it replaces. Shares contain immutable snapshots, stored token hashes, expiry, and irreversible revocation. Practice totals derive from service-recorded graded attempts. Usage accounting is service-only. Private exports and avatars use UUID-prefixed paths with a restrictive Storage fence.

Service RPCs provide bounded lookup caching, atomic quota consumption, private share resolution, expired-service-data cleanup, and account quota cleanup. The `private` schema is excluded from the exposed API schema list. API and database implementations share the exact RPC signatures documented in `supabase/README.md`.

## Verification performed

| Check                                           | Actual result                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Production migration execution                  | All three migrations applied unchanged to PGlite 0.5.8 / PostgreSQL 18.3                                      |
| Seed                                            | Applied twice without duplication; four example plans retained                                                |
| PostgreSQL behavior and ownership suite         | 108 assertions passed                                                                                         |
| Seeded allocation integrity                     | IPv4/IPv6 parent containment, gateway placement, and allocation non-overlap passed                            |
| Supabase configuration                          | Parsed with Python's TOML parser; private schema exclusion, confirmation settings, and OAuth defaults checked |
| Native Supabase PostgreSQL 17 suite             | Not executed; Docker and the Supabase CLI were unavailable                                                    |
| Auth, OAuth, mail, and Storage HTTP integration | Requires the configured local or hosted Supabase services                                                     |
| Multiple native database connections            | Requires deployment integration verification                                                                  |

The WASM runner uses minimal test fixtures for Supabase-managed Auth and Storage objects. It executes the production application policies, constraints, triggers, and RPCs without replacing them. The same SQL test file emits TAP for `supabase test db` and rolls back its fixtures.

## Commands

```bash
pnpm test:db:wasm
supabase start
supabase db reset
supabase test db
```

Use reset only on a disposable local development database. Hosted credentials and provider configuration are intentionally deployment inputs. Guest calculation and learning features do not require a configured Supabase service.

## Files

The implementation is in `supabase/`. Detailed schema, migrations, RPCs, setup, and verification limits are documented in `supabase/README.md`. Ownership, service boundaries, lookup egress, accounting, sharing, and deletion behavior are explained in `docs/security-model.md`.
