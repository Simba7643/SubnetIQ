# Browser verification

## Run the release gate

Use the Node and pnpm versions declared in the root package manifest. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
pnpm build
pnpm test:e2e:typecheck
pnpm test:e2e:production
```

The production command serves the existing frontend build on port 4173 and starts the guest-mode API on port 3001. The API uses `node --import tsx` so its startup does not depend on the tsx CLI's local IPC socket. Both servers receive explicit test configuration with Supabase and live AI credentials disabled. The production build must also use the example guest configuration for the unconfigured-account assertions.

`pnpm test:e2e` runs the same application workflows against Vite on port 5173 and omits the service-worker test, because service workers are disabled in development. Both commands start and stop their own servers unless `E2E_EXTERNAL_SERVER=1` is supplied. An existing local server may be reused outside CI. For an externally managed server, set `E2E_BASE_URL` to its origin and use the same guest-mode configuration.

## Coverage

The browser suite opens all 20 calculators and checks their default result, checks public and guest routes, changes the landing calculator, recovers from malformed input, and exercises VLSM overcommit. It checks clipboard copying, calculation URLs, JSON and CSV data, the PDF file signature, the browser print action, the command palette, reference searches, reproducible practice, and binary learning controls.

The assistant workflow sends a real HTTP request to the included API and consumes its SSE demonstration, including a canonically recomputed calculation context. DNS retry tests intercept the lookup endpoint with an explicitly synthetic response; they do not measure a live resolver.

Automated axe checks cover representative pages, a dark calculator, and mobile controls. Mobile workflows include drawer navigation, dark mode, Arabic direction, and horizontal overflow. The visual-review test writes desktop and mobile screenshots to `docs/screenshots` for human inspection; there is no invented visual baseline.

The production-only test waits for the service worker, inspects cache entries after API and private-route requests, disconnects the browser, reloads and changes a calculation, downloads a PDF offline, and opens the VLSM planner. It requires API requests to fail offline and prohibits API, account, authentication, project, share, and assistant paths from the cache.

## Reports

Playwright writes an HTML report to `playwright-report` and machine-readable results to `test-results/e2e-results.json`. Failed tests retain traces. Axe scans attach their complete violation details and record incomplete checks for later review. Screenshot tests attach their images to the report and write the same images to `docs/screenshots`.

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` and `PLAYWRIGHT_CHROMIUM_ARGS` support a separately installed Chromium when the environment requires one. The latter is a JSON array. These optional settings are intended for compatible runtime configuration; the release gate should normally use Playwright's matching installed browser.

## Workspace verification status

The E2E TypeScript check, ESLint check, and test discovery completed in the build workspace. Browser execution was blocked before page creation. The normal browser download returned invalid archive bytes. Two npm-distributed Chromium builds reported their version but exited with SIGTRAP during startup, including an attempt with all temporary files inside the workspace and a single renderer/raster thread. The API and Vite both started successfully in the final Playwright attempt.

That attempt stopped after one browser-launch infrastructure failure. No page assertions, axe scans, visual screenshots, Lighthouse measurements, or offline browser checks ran. The recorded diagnostic is `docs/verification/browser-launch.json`. CI retains the browser gate so these checks must actually pass in a compatible browser environment before a production release is approved.
