import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const rootDir = fileURLToPath(new URL('../../../../', import.meta.url));
const schema = `gf_test_admin_${randomUUID().replaceAll('-', '')}`;
const target = new URL('postgresql://game_feedback:game_feedback_local@127.0.0.1:55444/game_feedback_test');
target.searchParams.set('schema', schema);
process.env.GF_ADMIN_E2E_SCHEMA = schema;
process.env.GF_ADMIN_E2E_DATABASE_URL = target.toString();
const env = {
  NODE_ENV: 'test',
  DATABASE_URL: target.toString(),
  TEST_DATABASE_URL: target.toString(),
  GF_DEMO_MODE: 'true',
  GF_TEST_AUTH_ENABLED: 'true',
  PORT: '4304',
  WEB_ORIGIN: 'http://127.0.0.1:3304',
  API_ORIGIN: 'http://127.0.0.1:4304',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  X_CLIENT_ID: '',
  X_CLIENT_SECRET: '',
  KAKAO_CLIENT_ID: '',
  KAKAO_CLIENT_SECRET: '',
  DISCORD_CLIENT_ID: '',
  DISCORD_CLIENT_SECRET: '',
  SUPERCELL_API_TOKEN: '',
  GF_ADMIN_GOOGLE_SUB: '',
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
        'corepack yarn workspace @side/game-feedback db:test:sync && corepack yarn workspace @game-feedback/api db:seed && corepack yarn workspace @game-feedback/api test:server',
      cwd: rootDir,
      url: 'http://127.0.0.1:4304/api/session',
      env,
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command: 'corepack yarn workspace @game-feedback/admin dev',
      cwd: rootDir,
      url: 'http://127.0.0.1:3304',
      env: {
        GF_ADMIN_PORT: '3304',
        GF_ADMIN_API_ORIGIN: 'http://127.0.0.1:4304',
        GF_ADMIN_WEB_ORIGIN: 'http://127.0.0.1:3304',
      },
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
});
