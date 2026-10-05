# Phase 11 — Deployment, CI, and release packaging

## Delivered deployment configuration

| File                     | Purpose                                                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| apps/web/Dockerfile      | Builds shared packages and the complete static web output, then serves it as a nonroot Nginx process                                                  |
| apps/api/Dockerfile      | Builds and runs the Express API on Node.js 24, preserving workspace dependencies and runtime data files                                               |
| apps/web/nginx.conf      | Static public routing, bounded private-route fallback, no-store private responses, asset caching, health check, and an unbuffered API streaming proxy |
| docker-compose.yml       | Starts the compiled application locally in explicit guest mode; account configuration can be supplied through an untracked environment file           |
| .dockerignore            | Excludes credentials, installed dependencies, build outputs, reports, and release archives from the build context                                     |
| vercel.json              | Root-workspace web build, output directory, security/cache headers, and known dynamic-route rewrites                                                  |
| render.yaml              | Node.js API deployment, strict production settings, secrets supplied by the operator, PostgreSQL quotas, and database readiness                       |
| .github/workflows/ci.yml | Quality gates, SQL policy verification, production build, browser workflows, container smoke checks, reports, and source release artifacts            |
| docs/deployment.md       | Local, Docker, Supabase, Render, and Vercel setup; environment boundaries; verification, maintenance, and rollback                                    |

The repository README, environment reference, final verification record, phase documentation, and release packaging script are maintained at the project release level.

## Operational behavior

Both Docker builds pin pnpm 11.25.0 and use Node.js 24. The web image accepts public Vite values as build arguments. Backend Supabase service credentials and AI keys never become frontend build inputs. The API runtime includes the repository-level data directory required by graded learning operations.

The API image installs a clean production dependency tree separately from the build stage and copies only compiled workspace packages into that layout. Every install stage includes the registered dependency patch directory. Nginx access logs omit raw URLs, query strings, referrers, and IP addresses; the API proxy admits the 2.25 MiB project envelope while Express retains route-specific limits.

The default Compose stack publishes the web service on localhost:8080 and reaches the API over the internal Docker network. It runs compiled code with development guest settings so installation does not require accounts. Hosted production explicitly requires HTTPS origins, a stable quota secret, Supabase credentials, and the PostgreSQL quota store.

The Render readiness endpoint verifies a database RPC. Its liveness endpoint remains independent of database availability. Nginx forwards streaming responses without buffering and preserves the API path.

Public prerendered routes resolve as static files. Only the defined private application paths receive the SPA shell. Unknown public routes retain 404 responses. Cache policy uses the original Nginx request URI, so internal fallback to index.html does not remove private-route no-store and noindex headers.

## CI contract

The quality job installs the frozen lockfile, builds shared packages, runs type/lint/format/content checks, collects unit coverage, runs API tests and portable SQL policy tests, builds the production application, installs Chromium, runs browser workflows, and packages source archives. Verification reports and release archives become workflow artifacts.

The separate container job builds and starts both images, verifies web/API health and a public tool route, and checks that an unknown route returns 404. It always tears down its local composition.

The workflow contains no production credentials and does not itself create or deploy hosting resources.

## Verification status

Successfully executed in the build workspace:

- Parsed Docker Compose, Render Blueprint, and GitHub Actions YAML.
- Parsed Vercel JSON and checked its output directory and bounded rewrite set.
- Checked pinned toolchain versions, nonroot Docker users, API startup path, explicit runtime data copying, and the separation of frontend build arguments from service-role credentials.
- Checked the Render readiness path and Compose dependency-health relationship against the implemented API.
- Installed a clean production dependency tree in an isolated Node workspace, confirmed Jest/braces were absent, and started the compiled API from the copied runtime layout. Health, guest readiness, an IPv4 calculation, workspace imports, and root quiz-data presence passed. This check did not run Docker or Alpine.

Docker and Nginx are unavailable in the execution workspace. Container builds, Nginx configuration loading, and the container CI job were therefore not executed during artifact creation. The committed CI job performs those checks on a Docker-capable runner.

Hosted deployment and real account, OAuth, email, Storage, and live-provider integration require the operator's intended accounts and credentials. The deployment guide lists the exact checks to perform after configuration. This phase does not report those external checks as passed.
