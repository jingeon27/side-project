import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import { prepareBrowserDatabase } from '../api/src/testing/browser-database';

const rootDir = fileURLToPath(new URL('../../../../', import.meta.url));
const { databaseUrl } = prepareBrowserDatabase('mobile');
process.env.WEB_ORIGIN = 'http://127.0.0.1:3302';
const apiEnv = {
  NODE_ENV: 'test',
  ENVIRONMENT: 'test',
  GAME_FEEDBACK_API_URL: 'http://127.0.0.1:4302',
  SENTRY_DSN: '',
  NEXT_PUBLIC_SENTRY_DSN: '',
  NEXT_PUBLIC_AMPLITUDE_API_KEY: '',
  WEB_ORIGIN: 'http://127.0.0.1:3302',
  DATABASE_URL: databaseUrl.toString(),
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  KAKAO_CLIENT_ID: '',
  KAKAO_CLIENT_SECRET: '',
  DISCORD_CLIENT_ID: '',
  DISCORD_CLIENT_SECRET: '',
  SUPERCELL_API_TOKEN: '',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: { baseURL: 'http://127.0.0.1:3302', trace: 'retain-on-failure' },
  reporter: [['list']],
  globalTeardown: './e2e/teardown.ts',
  projects: [
    { name: 'android-webview', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    { name: 'ios-webview', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
  webServer: [
    {
      command:
        'yarn workspace @side/game-feedback db:test:sync && yarn workspace @game-feedback/api db:seed --fixtures && yarn workspace @game-feedback/api test:server',
      cwd: rootDir,
      url: 'http://127.0.0.1:4302/api/session',
      gracefulShutdown: { signal: 'SIGTERM', timeout: 60_000 },
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command:
        'yarn workspace @game-feedback/web build && yarn workspace @game-feedback/web exec next start --port 3302 --hostname 127.0.0.1',
      cwd: rootDir,
      url: 'http://127.0.0.1:3302/ko',
      env: {
        ...apiEnv,
        NODE_ENV: 'production',
        GAME_FEEDBACK_API_URL: 'http://127.0.0.1:4302',
      },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
