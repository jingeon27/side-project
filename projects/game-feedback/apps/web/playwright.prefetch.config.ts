import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import { prepareBrowserDatabase } from '../api/src/testing/browser-database';

const rootDir = fileURLToPath(new URL('../../../../', import.meta.url));
const { databaseUrl } = prepareBrowserDatabase('web');
process.env.WEB_ORIGIN = 'http://127.0.0.1:3353';
const apiEnv = {
  NODE_ENV: 'test',
  GAME_FEEDBACK_API_URL: 'http://127.0.0.1:4353',
  ENVIRONMENT: 'test',
  SENTRY_DSN: '',
  NEXT_PUBLIC_SENTRY_DSN: '',
  NEXT_PUBLIC_AMPLITUDE_API_KEY: '',
  WEB_ORIGIN: 'http://127.0.0.1:3353',
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
  testDir: './e2e-production',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: { baseURL: 'http://127.0.0.1:3353', trace: 'retain-on-failure' },
  reporter: [['list']],
  outputDir: '.e2e-build/prefetch-results',
  globalTeardown: './e2e/teardown.ts',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command:
        'yarn workspace @side/game-feedback db:test:sync && yarn workspace @game-feedback/api db:seed --fixtures && yarn workspace @game-feedback/api test:server',
      cwd: rootDir,
      url: 'http://127.0.0.1:4353/api/session',
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command:
        'yarn workspace @game-feedback/web build && yarn workspace @game-feedback/web exec next start --port 3353 --hostname 127.0.0.1',
      cwd: rootDir,
      url: 'http://127.0.0.1:3353/ko',
      env: {
        ...apiEnv,
        NODE_ENV: 'production',
        WEB_ORIGIN: 'https://feedback.example',
        GAME_FEEDBACK_API_URL: 'http://127.0.0.1:4353',
        // 운영 빌드 웹은 앱 링크 값이 없으면 첫 요청부터 실패한다.
      },
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
});
