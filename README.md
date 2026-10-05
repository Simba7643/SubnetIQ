# SubnetIQ

**Exact network calculations, practical address planning, and a learning workspace that explains the reasoning.**

SubnetIQ is a complete TypeScript monorepo with a React 18 frontend, an Express API, a shared exact-arithmetic engine, and a Supabase database. Its twenty calculators work without an account or external credentials. Account storage, remote lookup tools, and optional live AI connect through explicitly configured services.

## What is included

| Area      | Included behavior                                                                                                                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IPv4      | Subnet boundaries, masks, broadcast, usable capacity policies, binary/hex output, split planning, VLSM, exact and covering aggregation, range conversion, overlap checks, wildcard ACLs, reverse DNS, classification, mask tables |
| IPv6      | Exact 128-bit math, canonical compression, expansion, classification, EUI-64, hierarchical planning, reservations, mapped addresses, NAT64 encode/decode, historical 6to4 references                                              |
| Planning  | Named segments, growth headroom, locks, reservations, per-segment policies, capacity visualization, cloud variants, four adaptable network templates                                                                              |
| Learning  | Twelve original lessons, 302 glossary entries, 185 curated questions plus deterministic generated questions, four practice levels, explanations, timers, streaks, weak-topic analysis, printable cheat sheets                     |
| Toolkit   | Ports, protocols, OSI/TCP-IP, a clearly bounded OUI sample, DNS, RDAP with optional WHOIS fallback, firewall drafts, threats, local password/hash tools, headers/TLS, CVSS v4 reference, commands, bandwidth, MTU/MSS             |
| Accounts  | Email/password, magic links, Google/GitHub OAuth, profiles, private avatars/exports, favorites, saved calculations, account export/deletion                                                                                       |
| Projects  | Authenticated CRUD, routing-context labels, revision checkpoints, optimistic versions, restore, immutable read-only shares with expiry and revocation                                                                             |
| Assistant | Widget and full page, streamed Markdown, code copying, calculation context verified by the server, history, quota, stop/retry/export, selected-message sharing, explicit demonstration mode                                       |
| Product   | Responsive UI, light/dark/system themes, command search, reduced motion, English content, five locale structures with Arabic RTL, result CSV/JSON/PDF/print/share, five original technical articles                               |
| Delivery  | Public-route static content and SEO metadata, sitemap, robots, social assets, offline calculator caching, optional consent-controlled analytics, legal/contact pages, CI, Docker, Vercel/Render configurations                    |

The Arabic, Amharic, French, and Spanish structures translate navigation/common controls. Technical prose currently falls back to complete English content; these are not represented as fully translated courses. Anthropic and Gemini provider classes explicitly report that live adapters are not implemented; the OpenAI adapter is implemented, and unconfigured installations use labeled demonstration responses.

## Quick start: no credentials required

Install Node.js 24 and pnpm 11.25.0. Then run these commands from the extracted `subnetiq` directory:

```bash
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm dev
```

PowerShell uses `Copy-Item` instead of `cp`:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
pnpm dev
```

Open **http://localhost:5173**. The API listens on **http://localhost:3001**. Vite proxies `/api` to the backend.

Guest mode includes all local calculators, lessons, glossary, local toolkit functions, transient practice, and the assistant demonstration. Remote DNS/RDAP requires the API to reach its fixed public upstreams. Account features display an honest configuration requirement until Supabase is connected. Feedback is not claimed to be saved when persistence is unavailable.

## Enable accounts and persistent data

Create a Supabase project or run the included local Supabase configuration. Apply the three SQL migrations in timestamp order and then the seed. Never paste a service-role key into frontend configuration.

For a local Supabase installation with Docker and the Supabase CLI:

```bash
supabase start
supabase db reset
supabase status
```

Use the displayed local URL and keys in the two app-specific `.env` files. The web app needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The API needs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` for service-bound operations such as trusted grading, public share resolution, and account deletion.

Configure Supabase Auth’s site URL and allowed `/auth` redirect URLs for the web origin. Enable the Google/GitHub providers only after configuring their OAuth applications. See [the database guide](supabase/README.md), [environment reference](docs/environment.md), and [deployment guide](docs/deployment.md).

To enable real OpenAI responses, set these API-only values and restart the API:

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=your-server-side-key
OPENAI_MODEL=gpt-4.1-mini
```

Live model calls require a verified user session. Guest requests remain labeled demonstrations. Provider access, billing, supported model names, and live credentials belong to the deployment operator.

## Install, build, and run

| Command                               | Purpose                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm dev`                            | Build shared packages, then run API and Vite with watch mode                 |
| `pnpm build:packages`                 | Compile shared contracts and exact calculation engine                        |
| `pnpm build`                          | Compile packages/API/web; generate static SEO pages and final service worker |
| `pnpm --filter @subnetiq/api start`   | Start the compiled API                                                       |
| `pnpm --filter @subnetiq/web preview` | Preview the compiled frontend locally on port 4173                           |
| `pnpm typecheck`                      | Strict TypeScript checks across the workspace                                |
| `pnpm lint`                           | ESLint checks through the supplied legacy-to-flat configuration bridge       |
| `pnpm format:check`                   | Verify formatting                                                            |
| `pnpm format`                         | Apply Prettier formatting                                                    |

When previewing on port 4173, add that exact origin to the API’s `WEB_ORIGINS` if the browser accesses the API across origins. The standard preview proxy keeps local `/api` requests same-origin to the browser.

## Verification

```bash
pnpm typecheck
pnpm test:e2e:typecheck
pnpm lint
pnpm format:check
pnpm test:data
pnpm test
pnpm test:coverage
pnpm test:db:wasm
python3 scripts/test-package-release.py
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
pnpm build
pnpm test:e2e:production
pnpm audit --prod
```

`pnpm test` runs the Vitest package/web suites and the separate Jest/Supertest API suites. The database WASM gate applies the actual production migrations to PostgreSQL through PGlite, seeds twice, and runs ownership/history/share/quota/cache/storage assertions. Its minimal Auth/Storage harness does not replace a real Supabase service test.

With local Supabase running, execute the native SQL gate as documented in `supabase/README.md`. Multi-connection behavior, OAuth providers, email delivery, signed Storage URLs, live upstream networking, and live AI are deployment integration gates. The release’s actual execution results and any environment-limited checks are recorded in [verification](docs/verification.md), not inferred from the existence of tests.

## Deploy

- **Vercel frontend:** import the repository root, use the supplied `vercel.json`, and set build-time `VITE_*` values. The static output is `apps/web/dist`.
- **Render API:** use `render.yaml` or the API Dockerfile. Configure Supabase, exact HTTPS CORS origins, proxy hops, the rate-limit secret, and PostgreSQL-backed quotas.
- **Containers:** the two Dockerfiles and `docker-compose.yml` run frontend/API separately. The frontend proxies `/api` with SSE buffering disabled. Supabase is an external managed project or the separate Supabase CLI stack; a bare PostgreSQL container would not supply Auth or Storage.

Production startup deliberately fails if atomic PostgreSQL quotas, service credentials, a strong rate-limit secret, or HTTPS origins are missing. See [deployment](docs/deployment.md) for exact values and launch checks. No website, infrastructure, or paid provider was deployed merely by generating this source archive.

## Repository map

```text
apps/
  api/                 Express routes, security middleware, lookup and AI providers
  web/                 React application, local tools, accounts, learning, projects
packages/
  netcalc/             Exact network engine, fixtures, property tests
  shared/              Shared result types, validation, deterministic practice generation
supabase/
  migrations/          Schema, RLS, history, shares, service RPCs, private storage
  tests/               Native-compatible SQL assertions
  verify-wasm.mjs      Embedded PostgreSQL verification harness
content/
  blog/                Five complete original articles
  courses/             Twelve complete original course modules
data/                  Versioned reference datasets and provenance
docs/
  phases/              Phase 0 research and implementation records for phases 1–11
  verification.md      Actual release checks and remaining deployment gates
scripts/               SEO generation, data validation, reproducible packaging
.github/workflows/     CI checks and release artifacts
tests/e2e/             Browser, mobile, export, assistant, and accessibility flows
```

## Mathematical and security boundaries

The engine uses `BigInt` for addresses and exact counts; JSON represents large counts as decimal strings. IPv4 usable capacity depends on a selected LAN, point-to-point, or cloud policy. IPv6 has no IPv4-style broadcast reservation. Covering aggregation reveals additional addresses, while exact aggregation preserves the original union. IANA classification uses a versioned longest-prefix registry and describes mixed ranges instead of assigning a simplistic public/private flag.

Remote lookup input cannot choose arbitrary upstream URLs. DNS and RDAP transports use fixed/validated hosts, bounded responses, timeouts, public-address checks, and connection pinning. The API verifies bearer tokens, retains the user’s RLS context, recomputes saved calculations, grades quizzes on the server, and bounds assistant context and quota. The browser never receives service keys. More detail is in [security model](docs/security-model.md) and [SECURITY.md](SECURITY.md).

## Phase and source archives

`pnpm package:release` creates a complete source ZIP and a phase-organized ZIP in `release/`, plus SHA-256 checksums. The source archive excludes dependencies, local credentials, build caches, and Git internals. The phase archive groups the final implementation by phase and includes the research report; it is not a claim that intermediate phase folders are independently runnable historical commits.

## Naming, licenses, and contributions

SubnetIQ is a working project name, not a representation of affiliation with another organization or a trademark clearance. Change branding before a public launch if necessary. The code is licensed under MIT. Package licenses and data source attribution remain applicable. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
