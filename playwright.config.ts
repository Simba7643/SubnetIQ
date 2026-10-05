import { defineConfig, devices } from '@playwright/test';

const production = process.env.E2E_PRODUCTION === '1';
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${production ? '4173' : '5173'}`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browserArgs: string[] | undefined = process.env.PLAYWRIGHT_CHROMIUM_ARGS
  ? JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS)
  : undefined;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 2,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
  ],
  outputDir: 'test-results/browser',
  use: {
    baseURL,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
    launchOptions: { executablePath, args: browserArgs },
  },
  projects: [
    {
      name: 'chromium-desktop',
      testIgnore: production
        ? /.*\.mobile\.spec\.ts/
        : [/.*\.mobile\.spec\.ts/, /.*\.production\.spec\.ts/],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'chromium-mobile',
      testMatch: /.*\.mobile\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: process.env.E2E_EXTERNAL_SERVER
    ? undefined
    : [
        {
          command:
            'pnpm build:packages && pnpm --filter @subnetiq/api exec node --import tsx src/server.ts',
          url: 'http://127.0.0.1:3001/api/health',
          timeout: 120_000,
          reuseExistingServer: !process.env.CI,
          env: {
            NODE_ENV: 'test',
            HOST: '127.0.0.1',
            PORT: '3001',
            WEB_ORIGINS:
              'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173',
            AI_PROVIDER: 'mock',
            QUOTA_STORE: 'memory',
            LOG_LEVEL: 'error',
            SUPABASE_URL: '',
            SUPABASE_ANON_KEY: '',
            SUPABASE_SERVICE_ROLE_KEY: '',
            OPENAI_API_KEY: '',
            ANTHROPIC_API_KEY: '',
            GEMINI_API_KEY: '',
          },
        },
        {
          command: production
            ? 'pnpm --filter @subnetiq/web exec vite preview --host 127.0.0.1 --port 4173'
            : 'pnpm --filter @subnetiq/web exec vite --host 127.0.0.1 --port 5173',
          url: baseURL,
          timeout: 120_000,
          reuseExistingServer: !process.env.CI,
          env: {
            VITE_API_URL: '',
            VITE_SUPABASE_URL: '',
            VITE_SUPABASE_ANON_KEY: '',
            VITE_ANALYTICS_PROVIDER: '',
            VITE_ANALYTICS_DOMAIN: '',
            VITE_ANALYTICS_SCRIPT_URL: '',
          },
        },
      ],
});
