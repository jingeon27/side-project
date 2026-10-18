import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../../../../', import.meta.url));
const schema = process.env.GF_MOBILE_E2E_SCHEMA ?? `gf_test_mobile_${randomUUID().replaceAll('-', '')}`;
if (!/^gf_test_[a-z0-9_]+$/.test(schema)) throw new Error('E2E requires an isolated gf_test_ schema.');
process.env.GF_MOBILE_E2E_SCHEMA = schema;
const databaseUrl = new URL(
  process.env.TEST_DATABASE_URL ??
    'postgresql://game_feedback:game_feedback_local@127.0.0.1:55444/game_feedback_test',
);
if (
  !['postgresql:', 'postgres:'].includes(databaseUrl.protocol) ||
  !['127.0.0.1', 'localhost'].includes(databaseUrl.hostname) ||
  databaseUrl.port !== '55444' ||
  databaseUrl.pathname !== '/game_feedback_test' ||
  decodeURIComponent(databaseUrl.username) !== 'game_feedback'
)
  throw new Error('E2E requires the dedicated local Game Feedback test database.');
databaseUrl.searchParams.set('schema', schema);
process.env.GF_MOBILE_E2E_DATABASE_URL = databaseUrl.toString();
const apiEnv = {
  NODE_ENV: 'test',
  GF_DEMO_MODE: 'true',
  PORT: '4302',
  WEB_ORIGIN: 'http://127.0.0.1:3302',
  API_ORIGIN: 'http://127.0.0.1:4302',
  DATABASE_URL: databaseUrl.toString(),
  TEST_DATABASE_URL: databaseUrl.toString(),
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  X_CLIENT_ID: '',
  X_CLIENT_SECRET: '',
  KAKAO_CLIENT_ID: '',
  KAKAO_CLIENT_SECRET: '',
  DISCORD_CLIENT_ID: '',
  DISCORD_CLIENT_SECRET: '',
  GF_TEST_AUTH_ENABLED: 'true',
  SUPERCELL_API_TOKEN: '',
  GF_ADMIN_GOOGLE_SUB: '',
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
        'corepack yarn workspace @side/game-feedback db:test:migrate && corepack yarn workspace @game-feedback/api db:seed && corepack yarn workspace @game-feedback/api test:server',
      cwd: rootDir,
      url: 'http://127.0.0.1:4302/api/session',
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command:
        'corepack yarn workspace @game-feedback/web exec next dev --webpack --port 3302 --hostname 127.0.0.1',
      cwd: rootDir,
      url: 'http://127.0.0.1:3302/ko',
      env: {
        ...apiEnv,
        NODE_ENV: 'development',
        GAME_FEEDBACK_API_URL: 'http://127.0.0.1:4302',
        NEXT_DIST_DIR: '.next/e2e-mobile',
      },
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
});
