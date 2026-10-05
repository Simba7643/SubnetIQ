# Deployment and operations

SubnetIQ has three deployed services: a static React frontend, an Express API, and Supabase for PostgreSQL, Auth, and private Storage. The supplied configurations target Vercel for the frontend and Render for the API. Docker Compose provides a separate local path using the same compiled application.

No hosting resources are created by downloading or building this repository. Configure the intended accounts and domains before deploying.

## Runtime and directory contract

| Component       | Build / runtime                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------ |
| Workspace       | Node.js 24, pnpm 11.25.0, committed pnpm lockfile                                                |
| Shared types    | Build `packages/shared` before the API                                                           |
| Network engine  | Build `packages/netcalc` after shared types                                                      |
| Web application | `pnpm --filter @subnetiq/web build`; publish `apps/web/dist`                                     |
| API             | `pnpm --filter @subnetiq/api build`; run `node apps/api/dist/server.js` from the repository root |
| Database        | Apply the three migrations in `supabase/migrations` in filename order                            |

The API reads versioned content from the repository-level `data` directory. Keep that directory beside `apps` and `packages` in a runtime deployment. The API Docker image copies it explicitly and preserves pnpm workspace links.

The web build runs the SEO generator after Vite. Public routes receive their own `route/index.html` files, and a real `404.html` handles unknown static routes. Vercel and Nginx reserve SPA fallback for account, project, share, and assistant routes. Do not replace these bounded rules with a catch-all 200 response.

## Local development without accounts

Install Node.js 24 and pnpm 11.25.0, then run from the repository root:

```bash
pnpm install --frozen-lockfile
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
pnpm dev
```

Open `http://localhost:5173`. Vite forwards same-origin API requests to port 3001.

Empty Supabase settings activate the explicit guest experience: calculators, local exports, learning content, local toolkit operations, online lookups when reachable, and the labeled mock assistant. Saving, account history, and live authenticated AI remain unavailable until services are configured.

## Local Docker Compose

Install a supported Docker Engine or Docker Desktop with the Compose plugin, then run:

```bash
docker compose up --build --detach --wait
curl --fail http://localhost:8080/healthz
curl --fail http://localhost:8080/api/ready
```

Open `http://localhost:8080`. The web container publishes only on the host loopback interface by default. The API is reachable through Nginx at `/api` and is not separately published on the host.

This default composition serves compiled frontend assets while running the API in development guest mode with memory quotas. This lets the composition start with no credentials. It is a local evaluation configuration, not the hosted production configuration.

The containers run as nonroot users, use read-only root filesystems, drop Linux capabilities, and have bounded temporary filesystems. Compose waits for the API liveness check before starting the web service. Nginx streams AI responses with proxy buffering disabled. These choices are encoded in the supplied files; see the [Compose services reference](https://docs.docker.com/reference/compose-file/services/) for dependency and health-check behavior.

Stop the application with:

```bash
docker compose down
```

### Configure Compose with accounts

Create an untracked `.env.compose` file with the settings required for your installation. A minimal hosted-Supabase example has these keys:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-public-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-server-service-role-key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
WEB_ORIGINS=http://localhost:8080
VITE_SITE_URL=http://localhost:8080
QUOTA_STORE=postgres
```

The values above are illustrative configuration fields, not supplied credentials. Apply the migrations first, then run:

```bash
docker compose --env-file .env.compose up --build --detach --wait
```

Only public `VITE_` settings enter the web build. The service-role key and provider keys enter the API runtime only. Build arguments are not secret storage; [Docker documents their visibility and purpose](https://docs.docker.com/build/building/variables/).

| Compose variable             | Purpose                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `WEB_PORT`                   | Host port, default 8080; update the allowed origin and canonical site URL when changing it |
| `API_NODE_ENV`               | API mode; defaults to development                                                          |
| `WEB_ORIGINS`                | Exact browser origins, comma-separated without paths                                       |
| `VITE_API_URL`               | API origin only; leave empty to use the Nginx `/api` proxy                                 |
| `VITE_SITE_URL`              | Public site origin compiled into metadata                                                  |
| `SUPABASE_*`                 | API URL, public key, and server-only service credential                                    |
| `VITE_SUPABASE_*`            | Browser-reachable Supabase URL and public key                                              |
| `QUOTA_STORE`                | Memory for local guest operation or postgres for configured shared quotas                  |
| `RATE_LIMIT_SECRET`          | Stable random secret of at least 32 characters in production                               |
| `AI_PROVIDER` and `OPENAI_*` | Mock by default; OpenAI is the implemented live adapter                                    |

Frontend environment variables are compiled into JavaScript. Rebuild the web image after changing them.

### Connect the local Supabase CLI stack

The repository already contains a Supabase configuration. With the CLI and Docker available, start it from the repository root:

```bash
supabase start
supabase db reset
supabase test db
supabase status
```

Use `db reset` only for a disposable local database: it recreates its contents. The local Studio is on port 54323 and the local email inbox is on port 54324. Consult `supabase/README.md` for the SQL tests, configuration, and [CLI installation options](https://supabase.com/docs/guides/local-development/cli/getting-started).

For the API container, the local Supabase URL is `http://host.docker.internal:54321`. The Compose file supplies the host-gateway mapping on Linux. For the browser, use `http://localhost:54321`. These are two routes to the same local project; copy that project's actual public and service-role keys.

The Compose stack does not replace Supabase with a plain PostgreSQL container. Auth, Storage, and the service APIs remain part of the local Supabase stack.

## Hosted Supabase

Create or select the intended Supabase project. From an authenticated CLI session, link it and apply the migrations:

```bash
supabase login
supabase link
supabase migration list
supabase db push
```

Review the selected project and pending migrations before applying them. The included SQL uses the existing Supabase-managed Auth and Storage schemas. Never apply `supabase/wasm-bootstrap.sql` to a real Supabase project; it belongs exclusively to the portable SQL test harness.

Follow the [Supabase migration workflow](https://supabase.com/docs/guides/deployment/database-migrations) when maintaining migration history. Hosted Auth settings are configured separately from the local TOML.

Set the production site origin and the allowed frontend redirect URLs. The application returns to `/auth?returnTo=...` for sign-in and `/auth?mode=reset` for recovery. An explicit origin with the `/auth**` path pattern covers these query-bearing redirects; keep broader development or preview patterns out of the production allowlist. See [Supabase redirect matching](https://supabase.com/docs/guides/auth/redirect-urls).

Configure Google and GitHub clients in their provider consoles and in Supabase. Their provider callback is the project's `https://your-project.supabase.co/auth/v1/callback` endpoint; this differs from the frontend return URL. Configure email delivery before testing public signup, confirmation, magic links, and password recovery.

## Render API

Import the repository as a Render Blueprint using `render.yaml`. Keep the service root at the repository root so the API can build shared packages and read the data directory.

The Blueprint uses Node.js 24, builds with development dependencies available, starts the compiled API, and probes `/api/ready`. Auto-deploys wait for connected repository checks to pass. The configuration uses Render's documented [Blueprint fields](https://render.com/docs/blueprint-spec).

Supply these installation-specific values:

| Setting                     | Value                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `WEB_ORIGINS`               | Exact HTTPS frontend origin; add an explicitly approved preview origin only when needed |
| `SUPABASE_URL`              | Hosted Supabase project URL                                                             |
| `SUPABASE_ANON_KEY`         | Public project key                                                                      |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service credential                                                          |
| `RATE_LIMIT_SECRET`         | Generated by the Blueprint; keep it stable across instances                             |

The remaining defaults include `NODE_ENV=production`, `QUOTA_STORE=postgres`, and `TRUST_PROXY_HOPS=1` for the Render proxy. The API listens on Render's supplied `PORT` and on all container interfaces.

Production startup rejects memory quotas, non-HTTPS allowed origins, incomplete Supabase configuration, or an inadequate quota secret. Readiness checks the database RPC installed by the migrations. A failed readiness probe should be corrected by checking configuration, connectivity, and migrations.

The Blueprint starts on the free compute plan for evaluation. Select an appropriate production plan in Render before relying on continuous availability and your expected workload; no performance or availability guarantee is implied by the example.

The initial AI provider is the clearly labeled mock. To enable the implemented live integration, set `AI_PROVIDER=openai` and the server-only `OPENAI_API_KEY`, review `OPENAI_MODEL` and quotas, and redeploy. Anthropic and Gemini adapters report unavailable until implemented; adding those keys does not activate them.

## Vercel frontend

Import the repository as a Vercel project and keep its Root Directory at the repository root. Select Node.js 24. The supplied `vercel.json` sets the Vite framework, installation command, web build command, and `apps/web/dist` output directory.

Set these build-time values in the intended Vercel environment:

| Variable                  | Example / purpose                                             |
| ------------------------- | ------------------------------------------------------------- |
| `VITE_API_URL`            | The API HTTPS origin, such as `https://your-api.onrender.com` |
| `VITE_SUPABASE_URL`       | The same Supabase project used by the API                     |
| `VITE_SUPABASE_ANON_KEY`  | The project's public key                                      |
| `VITE_SITE_URL`           | The canonical frontend HTTPS origin                           |
| `VITE_APP_NAME`           | The configured public product name                            |
| `VITE_ANALYTICS_PROVIDER` | none until the selected analytics integration is configured   |

Do not append `/api` to `VITE_API_URL`: the client adds the API prefix. Do not place a service-role or AI-provider key in any `VITE_` variable.

Redeploy after changing a build-time setting. The configuration follows Vercel's [static project configuration](https://vercel.com/docs/project-configuration/vercel-json): public files resolve normally, known private routes load the application, and unknown static routes retain a 404 response. Private route responses use no-store and noindex headers.

The included Content Security Policy sets base-URI, object, framing, and form-action restrictions. It does not claim to be a complete script-origin allowlist. If you add a stricter policy, include the actual Supabase, API, analytics, worker, and font requirements and test every affected flow.

## CI and release checks

The GitHub Actions workflow runs on pull requests, pushes to main/master, and manual dispatch. It installs the locked dependencies, checks types/lint/formatting/content, runs mathematical/frontend coverage and API tests, executes the portable PostgreSQL policy tests, builds production artifacts, runs Chromium workflows, and creates source archives.

A separate container job builds both images, starts the default composition, probes the web and API, checks a rendered tool route, and verifies a 404 for an unknown route. Reports and source archives are uploaded as workflow artifacts. See the official [setup-node](https://github.com/actions/setup-node), [pnpm setup](https://github.com/pnpm/action-setup), and [artifact upload](https://github.com/actions/upload-artifact) repositories for those actions.

This workflow contains no hosting credentials and does not push a deployment itself. Provider Git integrations can deploy the reviewed branch after checks pass. The source release output is `release/`.

## Checks on the configured installation

After configuring the real environment, confirm the following concrete behaviors:

1. API liveness is 200 at `/api/health` and readiness is 200 at `/api/ready` with the expected database and provider mode.
2. A direct visit to a public calculator route returns crawlable HTML, and an unknown public path returns 404.
3. Signup, email confirmation, magic links, password recovery, and each enabled OAuth provider return to the intended frontend.
4. Two separate accounts cannot read or modify each other's projects, revisions, conversations, or private Storage objects.
5. A saved project reopens; revision restore preserves a new version; a revoked share link stops resolving.
6. Live DNS and registration lookups show their actual source and retrieval time. Upstream failures remain errors.
7. An authenticated AI request streams incrementally, cancellation works, and quota exhaustion returns the expected error.
8. Offline calculators and bundled learning references work; account, share, AI, and lookup responses do not become offline cache entries.

Run Lighthouse on production builds at representative public pages and review keyboard navigation and mobile layouts. Accessibility and performance targets must be measured against the configured deployment.

## Maintenance and rollback

Keep the stable rate-limit secret consistent across API instances. Rotating it changes quota subjects; coordinate rotation with operational records and quota expectations. Keep server credentials in the hosting provider's secret configuration.

Use the database's `purge_expired_service_data` function from a trusted maintenance job to remove expired cache records and old quota windows. It does not delete projects or conversations. Review backups and restoration using the actual Supabase plan and retention policy.

Rollback the frontend and API to a known compatible release through the host's deployment controls. Database schema changes require their own reviewed forward migration or recovery procedure; rolling back application code does not undo SQL migrations. Preserve the release ZIP and checksums so the code under investigation can be identified.

## Verification boundary for this delivery

The JSON and YAML configuration files were parsed successfully, and their environment, directory, readiness, route, and account-separation contracts were checked against the implementation. This execution workspace did not contain Docker or Nginx, so container builds, Nginx startup, and the container CI job were not executed here. Hosted Vercel/Render deployment, real OAuth/email/Storage integration, and live provider credentials were also not exercised. The supplied workflow and the configured-installation checks make those remaining deployment checks explicit.

## Production dependency boundary

The API Dockerfile builds TypeScript with development tools in the build stage, then installs only production dependencies into a separate clean stage. Runtime copies preserve pnpm workspace links and include the compiled shared packages plus root `data/`; test runners and build tools are not copied into the API runtime. The web runtime contains only Nginx and compiled public assets. Dependency audit reports distinguish runtime dependencies from development tooling.

The repository also ships `patches/@rollup__plugin-terser@1.0.0.patch`, registered in the pnpm workspace and lockfile. It supplies one minifier worker when a constrained environment reports zero CPUs. Both Docker build stages copy registered patches before the frozen install; keep the `patches/` directory in source releases and hosted build contexts.

Nginx access logs contain timestamp, HTTP method, status, response size, and duration. They omit raw URLs, query strings, referrers, IP addresses, and share tokens. The `/api/` transport permits a 2.25 MiB request envelope so valid large project saves reach the API; Express still enforces the smaller default body limit on other routes and the separate 2 MiB project-plan limit.
