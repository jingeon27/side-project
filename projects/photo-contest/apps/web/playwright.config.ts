import { buildAppUserAgent } from '@photo-contest/bridge';
import { apiWebServer, prepareE2eDatabase } from '@photo-contest/test-kit';
import { defineConfig, devices } from '@playwright/test';

import { API_PORT, WEB_ORIGIN, WEB_PORT } from './e2e/support/env';

const database = prepareE2eDatabase('web_e2e');

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_ORIGIN,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile-chrome',
      testIgnore: ['**/webview.spec.ts', '**/desktop-*.spec.ts'],
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'mobile-safari',
      testIgnore: '**/webview.spec.ts',
      grep: /@ios/,
      use: { ...devices['iPhone 15'] },
    },
    {
      name: 'desktop-chrome',
      testIgnore: '**/webview.spec.ts',
      grep: /@desktop/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webview',
      testMatch: '**/webview.spec.ts',
      use: {
        ...devices['Pixel 7'],
        userAgent: `${devices['Pixel 7'].userAgent} ${buildAppUserAgent('1.0.0')}`,
      },
    },
  ],
  webServer: [
    apiWebServer({
      port: API_PORT,
      webOrigin: WEB_ORIGIN,
      database,
      env: { GOOGLE_CLIENT_ID: 'web-e2e-client', GOOGLE_CLIENT_SECRET: 'web-e2e-secret', SENTRY_DSN: '' },
    }),
    {
      command:
        'yarn workspace @photo-contest/web build && yarn workspace @photo-contest/web exec node scripts/serve-cache-build.mjs',
      url: `${WEB_ORIGIN}/_health/live`,
      reuseExistingServer: false,
      timeout: 180_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 20_000 },
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NEXT_DIST_DIR: '.next/e2e',
        API_URL: `http://127.0.0.1:${API_PORT}`,
        WEB_ORIGIN,
        PORT: String(WEB_PORT),
        NEXT_PUBLIC_SENTRY_DSN: '',
        SENTRY_DSN: '',
        NEXT_PUBLIC_AMPLITUDE_API_KEY: '',
      },
    },
  ],
});
