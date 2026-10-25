import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import { E2E_APP_LINK_ENV } from './e2e/app-link-env';

const rootDir = fileURLToPath(new URL('../../../../', import.meta.url));
const schema = process.env.GF_E2E_SCHEMA ?? `gf_test_web_${randomUUID().replaceAll('-', '')}`;
if (!/^gf_test_[a-z0-9_]+$/.test(schema)) throw new Error('E2E requires an isolated gf_test_ schema.');
process.env.GF_E2E_SCHEMA = schema;
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
process.env.GF_E2E_DATABASE_URL = databaseUrl.toString();
const apiEnv = {
  GF_CACHE_REVALIDATION_SECRET: 'game-feedback-prefetch-cache-secret-'.repeat(2),
  GF_CACHE_REVALIDATION_URL: 'http://127.0.0.1:3353/internal/cache/revalidate',
  NODE_ENV: 'test',
  ENVIRONMENT: 'test',
  GF_DEMO_MODE: 'true',
  PORT: '4353',
  WEB_ORIGIN: 'http://127.0.0.1:3353',
  API_ORIGIN: 'http://127.0.0.1:4353',
  DATABASE_URL: databaseUrl.toString(),
  TEST_DATABASE_URL: databaseUrl.toString(),
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  KAKAO_CLIENT_ID: '',
  KAKAO_CLIENT_SECRET: '',
  DISCORD_CLIENT_ID: '',
  DISCORD_CLIENT_SECRET: '',
  GF_TEST_AUTH_ENABLED: 'true',
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
        'corepack yarn workspace @side/game-feedback db:test:sync && corepack yarn workspace @game-feedback/api db:seed && corepack yarn workspace @game-feedback/api test:server',
      cwd: rootDir,
      url: 'http://127.0.0.1:4353/api/session',
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command:
        'corepack yarn workspace @game-feedback/web build && corepack yarn workspace @game-feedback/web exec next start --port 3353 --hostname 127.0.0.1',
      cwd: rootDir,
      url: 'http://127.0.0.1:3353/ko',
      env: {
        ...apiEnv,
        NODE_ENV: 'production',
        GAME_FEEDBACK_API_URL: 'http://127.0.0.1:4353',
        NEXT_DIST_DIR: '.next/prefetch-e2e',
        GF_PREFETCH_TESTING: 'true',
        GAME_FEEDBACK_SITE_URL: 'https://feedback.example',
        // 운영 빌드 웹은 앱 링크 값이 없으면 첫 요청부터 실패한다.
        ...E2E_APP_LINK_ENV,
      },
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
});
