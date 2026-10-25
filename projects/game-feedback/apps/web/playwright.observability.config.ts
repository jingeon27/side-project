import { defineConfig } from '@playwright/test';

import base from './playwright.config';

if (!Array.isArray(base.webServer)) throw new Error('별도 API와 웹 서버가 필요합니다.');
export default defineConfig({
  ...base,
  testMatch: ['**/observability.spec.ts', '**/sentry-web-vitals.spec.ts'],
  testIgnore: [],
  outputDir: '.e2e-build/observability-results',
  webServer: base.webServer.map((server, index) => ({
    ...server,
    ...(index === 1
      ? {
          command:
            'corepack yarn workspace @game-feedback/web build && NEXT_PUBLIC_SENTRY_DSN= NEXT_PUBLIC_AMPLITUDE_API_KEY= corepack yarn workspace @game-feedback/web exec next start --port 3301 --hostname 127.0.0.1',
          timeout: 180_000,
        }
      : {}),
    env: {
      ...server.env,
      ...(index === 1
        ? {
            NODE_ENV: 'production',
            ENVIRONMENT: 'test',
            SENTRY_RELEASE: 'observability-test-release',
            NEXT_PUBLIC_AMPLITUDE_API_KEY: 'observability-test-key',
            NEXT_PUBLIC_SENTRY_DSN: 'https://test@sentry.invalid/1',
          }
        : {}),
    },
  })),
});
