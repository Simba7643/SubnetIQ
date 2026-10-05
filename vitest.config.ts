import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
const alias = {
  '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
  '@data': fileURLToPath(new URL('./data', import.meta.url)),
  '@subnetiq/netcalc': fileURLToPath(new URL('./packages/netcalc/src/index.ts', import.meta.url)),
  '@subnetiq/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
};
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: 'math', environment: 'node', include: ['packages/**/*.test.ts'] },
      },
      {
        resolve: { alias },
        esbuild: { jsx: 'automatic' },
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['apps/web/**/*.test.{ts,tsx}'],
          setupFiles: ['apps/web/src/test-setup.ts'],
          css: false,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: [
        'packages/netcalc/src/**',
        'packages/shared/src/**',
        'apps/web/src/lib/**',
        'apps/web/src/features/toolkit/{firewall,http,results}.ts',
      ],
    },
  },
});
