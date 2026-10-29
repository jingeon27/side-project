import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import { prepareBrowserDatabase } from '../api/src/testing/browser-database';

const rootDir = fileURLToPath(new URL('../../../../', import.meta.url));
const { databaseUrl: target } = prepareBrowserDatabase('admin');
process.env.WEB_ORIGIN = 'http://127.0.0.1:3304';
const env = {
  NODE_ENV: 'test',
  ENVIRONMENT: 'test',
  GAME_FEEDBACK_API_URL: 'http://127.0.0.1:4304',
  DATABASE_URL: target.toString(),
  WEB_ORIGIN: 'http://127.0.0.1:3304',
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
  workers: 1,
  timeout: 45_000,
  reporter: 'list',
  globalTeardown: './e2e/teardown.ts',
  use: { baseURL: 'http://127.0.0.1:3304', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command:
        'yarn workspace @side/game-feedback db:test:sync && yarn workspace @game-feedback/api db:seed --fixtures && node --require tsx/cjs projects/game-feedback/apps/admin/e2e/seed-admin.ts && yarn workspace @game-feedback/api test:server',
      cwd: rootDir,
      url: 'http://127.0.0.1:4304/api/session',
      gracefulShutdown: { signal: 'SIGTERM', timeout: 60_000 },
      env,
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command: 'yarn workspace @game-feedback/admin dev --port 3304',
      cwd: rootDir,
      url: 'http://127.0.0.1:3304',
      env: {
        ENVIRONMENT: 'test',
        GAME_FEEDBACK_API_URL: 'http://127.0.0.1:4304',
        WEB_ORIGIN: 'http://127.0.0.1:3304',
      },
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
});
