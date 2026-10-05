# Database, Auth, and Storage

The three migrations create the complete application schema. They target Supabase PostgreSQL 17 and use PostgreSQL types, constraints, triggers, table grants, row-level security, and narrowly granted functions. Apply the migrations in filename order through the Supabase CLI.

## Files and execution order

| File                                                  | Responsibility                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `migrations/20261004000100_core.sql`                  | Sixteen public tables, ownership relationships, indexes, profile creation, and immutable identity triggers                           |
| `migrations/20261004000200_ownership_and_history.sql` | RLS, network relationship checks, automatic revisions, share immutability, practice aggregation, atomic project mutation and restore |
| `migrations/20261004000300_service_and_storage.sql`   | Private cache and quotas, privileged RPCs, exports and avatar buckets, Storage policies                                              |
| `seed.sql`                                            | Four repeatable public network examples; no test accounts or passwords                                                               |
| `config.toml`                                         | Local Supabase configuration with Auth, private Storage, confirmation mail, and disabled OAuth providers awaiting credentials        |
| `tests/001_database.test.sql`                         | Native PostgreSQL tests with TAP output and rollback of all fixtures                                                                 |
| `verify-wasm.mjs`                                     | Executes the production migrations and SQL tests in PostgreSQL WASM                                                                  |
| `wasm-bootstrap.sql`                                  | Minimal Auth and Storage fixtures used exclusively by the WASM test harness                                                          |

Do not apply `wasm-bootstrap.sql` to Supabase. Supabase owns its real `auth` and `storage` schemas.

## Local development

Install the Supabase CLI and a supported Docker runtime, then run these commands from the repository root. Use a disposable local project: reset recreates its data.

```bash
supabase start
supabase db reset
supabase test db
supabase status
```

The API endpoint is `http://127.0.0.1:54321`; Studio is `http://127.0.0.1:54323`; the local mail inbox is `http://127.0.0.1:54324`. Copy the local URL and keys reported by `supabase status` into the corresponding frontend and backend environment files described in `docs/environment.md`. Keep the service-role key exclusively on the backend.

Email confirmation is enabled. Confirm local signup, recovery, and magic-link messages in the local mail inbox. Google and GitHub OAuth are disabled by default. Enable a provider only after registering its client and setting its secret and allowed callback URLs. The local provider callback is `http://127.0.0.1:54321/auth/v1/callback`; the frontend returns to `/auth` with a `returnTo` or `mode=reset` query. Local redirect patterns cover this route on localhost and 127.0.0.1, at ports 5173 and 8080 for Vite and Docker respectively. Configure the matching trusted `/auth` route on the deployed frontend origin as well.

For a hosted project, link the intended Supabase project and apply `supabase db push`. Configure hosted Auth site/redirect URLs, providers, email delivery, and API environment variables separately. The local TOML file does not configure an existing hosted Auth service automatically. Follow the [Supabase CLI configuration reference](https://supabase.com/docs/guides/local-development/cli/config) and [migration workflow](https://supabase.com/docs/guides/deployment/database-migrations).

## Public tables

All user-owned tables use `owner_id`, except `profiles`, whose `id` is the Auth user ID. Ownership refers to `auth.users`; deleting an account cascades through its relational data. Creation timestamps are UTC PostgreSQL timestamps. Large address counts in JSON remain decimal strings supplied by the calculation engine.

| Table                | Main fields and relationships                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `profiles`           | `id`, `display_name`, `avatar_path`, `preferences`, timestamps; signup automatically inserts a profile                                                                                           |
| `projects`           | `id`, `owner_id`, `name`, `description`, `address_space`, `plan`, `version`, `archived`, timestamps; matches the shared Project interface                                                        |
| `saved_networks`     | `project_id`, `parent_id`, `paired_network_id`, `name`, PostgreSQL `network cidr`, `gateway inet`, `purpose`, `vlan_id`, `notes`, `locked`, `reserved`, `growth_percent`, `position`, `metadata` |
| `saved_calculations` | Optional `project_id`, `name`, `tool_id`, `input`, `result`, timestamps                                                                                                                          |
| `vlsm_plans`         | Optional `project_id`, `name`, IPv4 `parent_network`, `policy`, `reserved`, `result`, timestamps                                                                                                 |
| `vlsm_segments`      | `plan_id`, `name`, `required_hosts`, `growth_percent`, `policy`, `locked_cidr`, `allocated_network`, exact `capacity`, `position`, timestamps                                                    |
| `project_revisions`  | `project_id`, checkpoint `name`, `snapshot`, `created_at`; users can append and read their checkpoints                                                                                           |
| `project_shares`     | `project_id`, SHA-256 `token_hash`, captured `snapshot`, `expires_at`, `revoked_at`, `created_at`                                                                                                |
| `quiz_attempts`      | `question_id`, `answer_index`, `correct`, `topic`, `difficulty`, `duration_ms`, optional `seed`; only the service records graded attempts                                                        |
| `practice_stats`     | Composite key `(owner_id, topic, difficulty)`, `attempts`, `correct_answers`, `total_duration_ms`, `best_streak`, `current_streak`, `last_practiced_at`                                          |
| `ai_conversations`   | `title`, timestamps, unique owner relationship                                                                                                                                                   |
| `ai_messages`        | `conversation_id`, `role`, `content`, `provider`, `mode`, timestamp; append-only through the user role                                                                                           |
| `ai_usage_events`    | Optional `conversation_id`, `provider`, `input_tokens`, `output_tokens`, `status`; only the service writes usage                                                                                 |
| `favorites`          | Unique `(owner_id, tool_id)`, optional `label`, timestamp                                                                                                                                        |
| `feedback`           | Optional `owner_id` and `email`, bounded `message`, service-managed `status`, timestamp                                                                                                          |
| `network_templates`  | Public read-only `id`, `name`, `description`, `category`, `plan`, timestamps                                                                                                                     |

Projects use `plan` as their complete editable snapshot. A revision captures the project row and its `plan`. Independently inserted normalized `saved_networks` or VLSM rows are separate records; represent allocations inside `plan` when they must participate in project revisions and sharing.

## RPC contract

| Function                                                                                                         | Caller              | Result                                                                              |
| ---------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------- |
| `mutate_project(p_project_id uuid, p_expected_version integer, p_changes jsonb)`                                 | Authenticated owner | Updated `projects` row; optimistic version match, automatic previous-state snapshot |
| `restore_project(p_project_id uuid, p_revision_id uuid, p_expected_version integer)`                             | Authenticated owner | Updated `projects` row with a new version and preserved prior state                 |
| `consume_api_quota(p_subject text, p_scope text, p_limit integer, p_window_seconds integer, p_cost integer = 1)` | Service only        | One row: `allowed`, `remaining`, `retry_after_seconds`, `used`, `reset_at`          |
| `get_lookup_cache(p_key text)`                                                                                   | Service only        | Unexpired JSON value or null                                                        |
| `put_lookup_cache(p_key text, p_kind text, p_value jsonb, p_ttl_seconds integer)`                                | Service only        | Void; TTL must be 1–86,400 seconds                                                  |
| `resolve_shared_project(p_token_hash text)`                                                                      | Service only        | Unexpired, unrevoked snapshot or null                                               |
| `purge_expired_service_data()`                                                                                   | Service only        | Counts of removed cache entries and old quota buckets                               |
| `purge_quota_subject(p_subject text)`                                                                            | Service only        | Void; removes quota buckets for a deleted account's HMAC subject                    |

`mutate_project` accepts only `name`, `description`, `address_space`, `plan`, and `archived`. Send the current version separately as `p_expected_version`. Stale writes raise SQLSTATE `40001`; inaccessible project or revision IDs raise `P0002`; invalid arguments raise `22023`. Unchanged values leave the version unchanged. The API maps these into user-facing HTTP errors.

Supported network policies are `lan`, `point-to-point`, `aws`, `azure`, and `gcp`. AI message roles are `user` and `assistant`; modes are `live`, `demo`, or `mock`; provider values are `openai`, `anthropic`, `gemini`, or `mock`. Usage statuses are `completed`, `cancelled`, `failed`, or `demo`. Cache kinds are `dns`, `rdap`, `bootstrap`, and `whois`.

## Storage and account deletion

Both buckets are private. Object keys begin with the authenticated user's UUID followed by `/`. The path is authoritative so backend-generated exports with no Storage owner metadata can still be read by the intended user.

| Bucket    | Maximum object size | Accepted media                  |
| --------- | ------------------- | ------------------------------- |
| `exports` | 25 MiB              | PDF, CSV, JSON, ZIP, plain text |
| `avatars` | 5 MiB               | PNG, JPEG, WebP, GIF            |

The API removes account objects through the Storage API before deleting the Auth user. Deleting SQL metadata alone does not delete an object from the backing object store. Account deletion also removes the user's quota subject through the service RPC. Operational IP quota buckets have independent retention.

Schedule `purge_expired_service_data` from a trusted deployment maintenance job if persistent traffic requires automatic housekeeping. It removes expired lookup entries and quota windows that ended more than seven days earlier. It never deletes projects or conversation records.

## Verification status

Run the portable PostgreSQL check without Docker after installing repository dependencies:

```bash
pnpm test:db:wasm
```

The same `tests/001_database.test.sql` runs under native `supabase test db` and the WASM harness. It creates isolated test users, switches database roles and request claims, exercises RLS and service boundaries, emits TAP assertions, and rolls back all test state. The tests do not replace production RLS functions or constraints.

At delivery, all three migrations, the repeatable seed, and 108 SQL assertions passed in PGlite 0.5.8, which reports PostgreSQL 18.3. TOML parsing also passed. Native Supabase PostgreSQL 17, real Auth HTTP behavior, OAuth, local mail delivery, Storage signed URLs, and concurrent requests through multiple database connections were not executed in this build environment. Run the native command and service integration checks against the actual deployment before launch. The standalone WASM harness verifies PostgreSQL policy and trigger behavior within its stated fixture scope.
