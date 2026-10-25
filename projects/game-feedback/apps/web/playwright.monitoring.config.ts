import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

import { defineConfig, devices } from '@playwright/test';

import { prepareBrowserDatabase } from '../api/src/testing/browser-database';

const settings = parseEnv(readFileSync(new URL('../../.env', import.meta.url), 'utf8'));
const dsn = settings.NEXT_PUBLIC_SENTRY_DSN?.trim();
const apiKey = settings.NEXT_PUBLIC_AMPLITUDE_API_KEY?.trim();
if (!dsn || !apiKey) throw new Error('프로젝트 .env의 웹 Sentry·Amplitude 키가 필요합니다.');
Object.assign(process.env, { NEXT_PUBLIC_SENTRY_DSN: dsn, NEXT_PUBLIC_AMPLITUDE_API_KEY: apiKey });
const { databaseUrl } = prepareBrowserDatabase('web');
const webOrigin = 'http://127.0.0.1:3354';
const apiEnv = {
  NODE_ENV: 'test',
  ENVIRONMENT: 'test',
  DATABASE_URL: databaseUrl.toString(),
  GAME_FEEDBACK_API_URL: 'http://127.0.0.1:4354',
  WEB_ORIGIN: webOrigin,
  SENTRY_DSN: '',
  NEXT_PUBLIC_SENTRY_DSN: '',
  NEXT_PUBLIC_AMPLITUDE_API_KEY: '',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  KAKAO_CLIENT_ID: '',
  KAKAO_CLIENT_SECRET: '',
  DISCORD_CLIENT_ID: '',
  DISCORD_CLIENT_SECRET: '',
  SUPERCELL_API_TOKEN: '',
  PUSH_NOTIFICATIONS_ENABLED: 'false',
  EXPO_ACCESS_TOKEN: '',
};

export default defineConfig({
  testDir: '.',
  testMatch: ['test/monitoring/**/*.spec.ts', 'e2e/sentry-web-vitals.spec.ts'],
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: 'list',
  globalTeardown: './e2e/teardown.ts',
  use: { baseURL: webOrigin, trace: 'off', screenshot: 'off', video: 'off' },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: [
    {
      command:
        'corepack yarn workspace @side/game-feedback db:test:sync && corepack yarn workspace @game-feedback/api test:server',
      cwd: fileURLToPath(new URL('../../../../', import.meta.url)),
      url: 'http://127.0.0.1:4354/api/session',
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 90_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 20_000 },
    },
    {
      command: 'yarn build && yarn exec node ../../../../scripts/serve-monitoring-build.ts',
      url: `${webOrigin}/ko`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
      gracefulShutdown: { signal: 'SIGTERM', timeout: 20_000 },
      env: {
        ...apiEnv,
        NODE_ENV: 'production',
        NEXT_PUBLIC_SENTRY_DSN: dsn,
        NEXT_PUBLIC_AMPLITUDE_API_KEY: apiKey,
        SENTRY_RELEASE: settings.SENTRY_RELEASE ?? '',
      },
    },
  ],
});
