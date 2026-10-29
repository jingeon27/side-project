import { defineConfig, devices } from '@playwright/test';

const webOrigin = 'http://127.0.0.1:3337';

export default defineConfig({
  testDir: './test/observability',
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: 'list',
  outputDir: 'test-results/observability',
  use: { baseURL: webOrigin, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: {
    command: 'yarn build && yarn exec node ../../../../scripts/serve-monitoring-build.ts',
    url: `${webOrigin}/privacy`,
    reuseExistingServer: false,
    timeout: 180_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 20_000 },
    env: {
      NODE_ENV: 'production',
      WEB_ORIGIN: webOrigin,
      API_URL: 'http://127.0.0.1:4337',
      SENTRY_DSN: '',
      SENTRY_RELEASE: 'photo-contest-observability-release',
      NEXT_PUBLIC_SENTRY_DSN: 'https://test@sentry.invalid/1',
      NEXT_PUBLIC_AMPLITUDE_API_KEY: '',
    },
  },
});
