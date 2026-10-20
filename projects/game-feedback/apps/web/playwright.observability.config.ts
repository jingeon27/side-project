import { defineConfig } from '@playwright/test';
import base from './playwright.config';
if (!Array.isArray(base.webServer)) throw new Error('별도 API와 웹 서버가 필요합니다.');
export default defineConfig({
  ...base,
  testMatch: '**/observability.spec.ts',
  testIgnore: [],
  webServer: base.webServer.map((server, index) => ({
    ...server,
    env: {
      ...server.env,
      ...(index === 1
        ? {
            NEXT_DIST_DIR: '.next/observability',
            NEXT_PUBLIC_AMPLITUDE_API_KEY: 'observability-test-key',
            NEXT_PUBLIC_SENTRY_DSN: 'https://test@sentry.invalid/1',
          }
        : {}),
    },
  })),
});
