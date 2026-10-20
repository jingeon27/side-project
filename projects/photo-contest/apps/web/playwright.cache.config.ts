import { apiWebServer, prepareE2eDatabase } from '@photo-contest/test-kit';
import { defineConfig, devices } from '@playwright/test';
import { CACHE_API_PORT, CACHE_API_URL, CACHE_WEB_ORIGIN, CACHE_WEB_PORT } from './test/cache/env';

const database = prepareE2eDatabase('web_cache');

export default defineConfig({
  testDir: './test/cache',
  testMatch: '**/*.spec.ts',
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], baseURL: CACHE_WEB_ORIGIN, trace: 'retain-on-failure' },
  webServer: [
    apiWebServer({ port: CACHE_API_PORT, webOrigin: CACHE_WEB_ORIGIN, database }),
    {
      command:
        'yarn workspace @photo-contest/web build && yarn workspace @photo-contest/web exec node scripts/serve-cache-build.mjs',
      url: `${CACHE_WEB_ORIGIN}/_health/live`,
      reuseExistingServer: false,
      timeout: 180_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 20_000 },
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NEXT_DIST_DIR: '.next/cache-e2e',
        API_URL: CACHE_API_URL,
        WEB_ORIGIN: CACHE_WEB_ORIGIN,
        PORT: String(CACHE_WEB_PORT),
        NEXT_PUBLIC_SENTRY_DSN: '',
        SENTRY_DSN: '',
        NEXT_PUBLIC_AMPLITUDE_API_KEY: '',
      },
    },
  ],
});
