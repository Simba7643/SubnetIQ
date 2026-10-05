# Testing and release verification

## What was actually verified

This release was built in a constrained Linux workspace with Node.js 24.19.0 and pnpm 11.25.0. The deterministic engine, browser logic under jsdom, backend request handlers with controlled upstream fixtures, PostgreSQL policies in WASM, dependency audit, and build/configuration checks are independently testable without production credentials.

A browser launch failure is recorded separately from application test results. Chromium 131 and 153 both exited with SIGTRAP before creating a page in this workspace. The direct Playwright browser download also returned an invalid archive. The API and Vite test servers did start. No Playwright page assertion, axe browser scan, screenshot review, offline service-worker assertion, or Lighthouse measurement is recorded as passed here. See `docs/verification/browser-launch.json` for the sanitized launch evidence. The supplied CI workflow installs a normal Chromium runtime and runs the production browser suite.

The completed focused release checks cover calculators, toolkit, assistant UI, analytics privacy, CSV exports, and account changes with asynchronous Storage/export operations. These overlap the normal Vitest run and must not be added to its totals. Final complete-suite counts and build evidence are recorded in [verification.md](verification.md); phase-specific records retain their corresponding checkpoints.

Docker, Nginx, native Supabase PostgreSQL 17, real OAuth, hosted email delivery, signed Storage URLs, and a live model-provider account were not available for end-to-end execution here. Their deployment gates are listed below. Configuration parsing and source review do not prove that a container or hosted service has run.

## Install and run the local gates

Run commands from the repository root. Use the committed lockfile, workspace file, and `patches/` directory together. The registered Rollup/Terser patch supplies one worker when a constrained host reports zero CPUs; omitting it makes a frozen install fail.

```bash
pnpm install --frozen-lockfile
pnpm build:packages
pnpm -r typecheck
pnpm test:e2e:typecheck
pnpm lint
pnpm format:check
pnpm test:data
pnpm test:coverage
pnpm --filter @subnetiq/api test
pnpm test:db:wasm
pnpm build
pnpm audit --prod
```

| Command                            | Scope and interpretation                                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm build:packages`              | Compiles shared contracts and the exact network engine before consumers run.                                                           |
| `pnpm typecheck`                   | Builds shared packages and checks every workspace TypeScript project.                                                                  |
| `pnpm test:e2e:typecheck`          | Checks the Playwright tests and their configuration. This does not launch a browser.                                                   |
| `pnpm lint` / `pnpm format:check`  | Static code and repository-format checks.                                                                                              |
| `pnpm test:data`                   | Validates curated data shapes, IDs, relationships, references, and template allocation integrity.                                      |
| `pnpm test:unit`                   | Runs both Vitest projects: engine/shared logic under Node and web logic under jsdom.                                                   |
| `pnpm test:coverage`               | Runs Vitest with V8 coverage and produces `coverage/`. It does not run API Jest tests.                                                 |
| `pnpm --filter @subnetiq/api test` | Runs the four backend Jest/Supertest suites with the required ESM VM option.                                                           |
| `pnpm test`                        | Builds shared packages, then runs Vitest and API Jest tests.                                                                           |
| `pnpm test:db:wasm`                | Applies actual migrations and SQL security tests to the portable PostgreSQL harness.                                                   |
| `pnpm build`                       | Builds packages, API, and web assets, then generates semantic static routes and the final service worker.                              |
| `pnpm test:e2e`                    | Starts the API and Vite development servers and runs the normal desktop/mobile browser cases.                                          |
| `pnpm test:e2e:production`         | Uses the existing web `dist/` through the preview server on port 4173; adds real service-worker/offline tests. Run `pnpm build` first. |
| `pnpm package:release`             | Creates reviewable source and phase archives; packaging is not an additional test pass.                                                |

The test commands themselves are the reproducible gates. Coverage is restricted to the configured engine, shared, browser-library, and selected toolkit modules; a percentage for this scope must not be presented as coverage of every application page.

## What the automated suites cover

The math project exercises IPv4 and IPv6 parsing/formatting, prefix boundaries, LAN and point-to-point host counts, cloud reservation policies, CIDR splitting, VLSM allocation, aggregation, range conversion, overlap checks, mapping, reverse DNS, EUI-64, wildcard masks, bandwidth, and MTU. Property-based cases check containment, non-overlap, capacity, round trips, and large exact counts. IPv6 sizes remain decimal strings backed by BigInt arithmetic.

The web tests use real calculation logic for calculator validation, recalculation, route inputs, policy changes, planning, and explanations. Learning tests cover generated questions, answer/review behavior, glossary/course interactions, and configured versus guest behavior. Toolkit checks include injection-resistant firewall inputs, CVSS vector validation, sensitive HTTP-header removal, known WebCrypto digests, password-source exclusion, template integrity, DNS success/error presentation, and planner links.

The release privacy tests exercise consent withdrawal and late tracker dispatch; exclusion of private, unknown, and query-bearing URLs; removal of analytics referrers and arbitrary properties; rejection of legacy automatic tracker scripts; spreadsheet formula prefixes behind whitespace/control characters; and retention of explanations, limitations, table rows, sources, and engine versions in CSV exports.

The account tests exercise asynchronous completions after logout, account switching, and unmount; avatar ownership and stale signed-URL results; private-export pagination; cleanup error reporting; and prevention of a stale download or clipboard write. Storage calls are controlled fixtures in these tests. Actual HTTP Storage authorization must still pass the native integration checks.

The API suites use Supertest and controlled Auth/provider/lookup responses. They verify token validation and propagation, user-scoped database clients, body limits, errors, quotas, share hashing and no-store responses, project version conflicts, DNS/RDAP destination restrictions, public-address validation, TLS destination pinning, upstream failures, bounded caches, and streamed assistant cancellation/error handling. Passing provider fixtures validates the implemented protocol handling; it does not establish that a particular deployed provider key or model is available.

## Database verification boundaries

`pnpm test:db:wasm` executes the three production migrations unchanged, applies the seed twice, and runs 108 SQL assertions in PGlite 0.5.8 / PostgreSQL 18.3. The harness supplies small fixtures for Supabase-managed Auth and Storage objects. It verifies production ownership policies, grants, constraints, triggers, revision behavior, share immutability, and service-function restrictions within that environment.

For the actual target services, use a disposable local Supabase stack:

```bash
supabase start
supabase db reset
supabase test db
supabase status
```

`supabase db reset` recreates the local database; run it only on an intended disposable development project. Do not apply `wasm-bootstrap.sql` to a native or hosted Supabase project.

Native verification must include two different authenticated users and an anonymous client. Check that one user cannot read, update, delete, restore, or attach records belonging to the other by changing IDs in direct HTTP requests. Test child-network and conversation ownership independently of the UI. Repeat concurrent quota increments and optimistic project updates over separate native database connections; a single-process WASM run does not establish distributed behavior.

## Browser, accessibility, and mobile checks

On a host that can run Chromium:

```bash
pnpm exec playwright install --with-deps chromium
pnpm build
pnpm test:e2e:production
```

The Playwright configuration uses desktop Chrome and a Pixel 7 viewport, reduced motion, retained failure traces, screenshots on failure, JSON results, and an HTML report. Normal browser tests use guest mode and a labeled mock assistant so no live credentials are necessary. `E2E_EXTERNAL_SERVER=1` permits an explicitly supplied server; `E2E_BASE_URL` selects that server. An already-installed compatible Chromium can be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. These overrides do not turn a failed launch into a successful application test.

Inspect `playwright-report/` and `test-results/` after a run. A passing browser gate should cover calculator workflows and exports, learning interactions, invalid inputs, guest account behavior, command search, responsive layouts, keyboard operation, and the supplied axe checks. The production-only suite checks actual service-worker caches, offline calculators/PDF export, and exclusion of private/API paths.

The mobile drawer closes by its close button, overlay, Escape, or route navigation. While open, its background is inert, Tab stays within the drawer, body scrolling is locked, and focus returns to the menu trigger on close. The desktop sidebar remains ordinary navigation. Verify these behaviors with an actual keyboard and screen reader at the deployment viewport; jsdom compilation cannot establish visual focus placement.

For PDF review, download a result with long IPv6 values, multiple table pages, mathematical symbols, limitations, and sources. The embedded DejaVu Sans regular/bold fonts preserve supported Unicode glyphs. Confirm readable wrapping and complete rows after opening the downloaded file. JSON and CSV can be inspected without a browser; do not infer PDF visual quality solely from a completed download.

## Performance and SEO measurement

The goal is at least 90 in Lighthouse performance, accessibility, best practices, and SEO on representative public pages. No numerical Lighthouse score was measured in this workspace because Chromium could not start.

Measure the compiled site, not Vite's development server. Start `pnpm --filter @subnetiq/web preview` after `pnpm build`, or use the actual HTTPS deployment. Run Lighthouse on the home page, an IPv4 calculator, a VLSM planner, and a learning article with the same mobile settings. Preserve JSON/HTML reports, browser/Lighthouse versions, throttling settings, and the measured URL. Repeat enough times to distinguish a stable regression from noise; report the median and the relevant limiting audits.

An example command on a host with Chrome installed is:

```bash
pnpm dlx lighthouse http://127.0.0.1:4173/ --only-categories=performance,accessibility,best-practices,seo --output=html --output=json --output-path=./lighthouse-home
```

Run a cold-load measurement before service-worker caches warm, and check a repeat visit separately. Check page titles, canonical URLs, crawlable default examples, sitemap/robots behavior, unknown-route 404s, and noindex private routes on the actual static host. A development-server SPA fallback is not evidence that Nginx or Vercel routing matches the deployment configuration.

## Dependency audit

The final production audit after the router update reported zero vulnerabilities. React Router was upgraded from 6.30.6 to 7.18.4, within the declared `^7.18.0` range. Its declared peers support React 18; obsolete version-six future flags were removed and routed UI tests passed.

The full audit retains one high-severity, development-only advisory for `braces@3.0.3` through Jest's test-discovery dependencies: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The registry reported no published patched version. It concerns stack exhaustion from deeply nested glob patterns in build/test tooling. User request data is not passed to that dependency by the application. The API Dockerfile installs a clean production dependency tree separately from the build stage; the web runtime contains only compiled assets and Nginx. Monitor and update the test dependency when an upstream patch becomes available.

The two resolved production advisories are [the navigation backslash redirect](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) and [the SSR hydration constructor issue](https://github.com/advisories/GHSA-337j-9hxr-rhxg). This application uses declarative routing and does not use the affected manual SSR hydration path; the upgrade removes both flagged package ranges.

Machine-readable reports are in `docs/verification/dependency-audit.json` and `docs/verification/dependency-audit-production.json`. Audit results describe the registry snapshot at execution time, not an indefinite guarantee.

## Container and hosted-service gates

The Compose, Render, and CI YAML plus Vercel JSON were parsed. Root build contexts, registered patch copying, pnpm workspace links, compiled entry paths, runtime data copying, production-only API dependencies, nonroot users, and public/private route settings were reviewed against the implementation. Docker and Nginx were unavailable, so no container-build or Nginx-runtime success is claimed.

A clean isolated installation using the Dockerfile's production dependency command did complete in the Node workspace. Jest and braces were absent from that installed tree. The copied compiled API started successfully, returned HTTP 200 for health, guest readiness, and an IPv4 calculation, resolved its workspace engine imports, and found the root quiz data at the expected path. This verifies the dependency/data layout without exercising Alpine, Docker, or Nginx. The result is recorded in `docs/verification/production-runtime.json`.

On a Docker-capable machine:

```bash
docker compose config
docker compose up --build --detach --wait --wait-timeout 120
curl --fail http://localhost:8080/healthz
curl --fail http://localhost:8080/api/ready
curl --head http://localhost:8080/tools/ipv4-subnet
curl --head http://localhost:8080/share/invalid-token
docker compose down --remove-orphans
```

The default Compose stack intentionally runs compiled guest-mode API behavior with memory quotas. It does not satisfy the production account/quota configuration. Before a hosted launch, set the production configuration described in `docs/environment.md`, apply migrations, and verify these concrete service boundaries:

1. **Readiness and secrets.** `/api/health` remains a liveness check. `/api/ready` must return success with the production database RPC available and fail when that dependency is unavailable. Build output must contain no service-role or provider secrets. Only public Supabase values belong in `VITE_*`.
2. **Auth, email, and OAuth.** Test signup confirmation, password sign-in, magic links, password recovery, expired links, logout, and the enabled Google/GitHub providers. The frontend callback is `/auth` with its allowed query parameters. Check allowed redirect origins and that unexpected external `returnTo` values are rejected. Confirm user identity through the backend, not only the browser session.
3. **Projects and revisions.** Create, edit, export, restore, archive, and delete with real user credentials. Confirm stale versions produce conflicts and valid larger project payloads pass the Nginx/API limits.
4. **Private Storage and deletion.** Upload allowed image types and reject oversize/unsupported inputs. Confirm private exports are readable only by their owner; temporary URLs expire after five minutes. Test a file deletion and an account deletion using disposable accounts, then verify both Storage objects and relational data are removed. Exercise a controlled partial cleanup failure and the reported retry path.
5. **Public sharing.** Open a valid snapshot anonymously, verify it remains an immutable version, revoke it, and verify subsequent reads fail. Check `Cache-Control: no-store`, noindex, no-referrer, and service-worker exclusion for `/share/*` and API reads. Nginx access logs must omit raw paths, queries, referrers, and share tokens.
6. **Analytics consent.** With an intended current Plausible `pa-*.js` script, inspect the browser network panel before consent, after acceptance, on private routes, and after withdrawal. No script loads before consent or directly on a private route; outgoing allowed events contain only a public URL without query/fragment, a configured site domain, an allowed event name, and a null referrer. Form/input/download capture stays disabled.
7. **Real lookups.** Exercise the approved DNS and regional-registry endpoints, cache expiry, timeout handling, and network denial. Returned records must retain source/retrieval/cache provenance. Network errors must remain explicit.
8. **Live assistant.** Configure the implemented OpenAI adapter with an authorized model and a small test budget. Verify streaming, cancellation, output limits, timeout/error messages, usage accounting, and the daily quota across multiple API instances. Provider-protocol fixtures do not replace this check. Other configured provider names remain clearly labeled demonstrations until their adapters are implemented.

These checks complete the operational verification on the actual target host and account services. The source release includes the implementation, test harnesses, configuration, and explicit evidence boundaries required to run them.
