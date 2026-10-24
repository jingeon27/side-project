import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

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
// 쓰기 뒤 공개 상세 캐시는 API의 무효화 콜백만 만료한다. 앱이 여는 3302 웹 서버에도 같은 비밀을 준다.
const apiEnv = {
  GF_CACHE_REVALIDATION_SECRET: 'game-feedback-mobile-e2e-cache-secret-'.repeat(2),
  GF_CACHE_REVALIDATION_URL: 'http://127.0.0.1:3302/internal/cache/revalidate',
  NODE_ENV: 'test',
  SENTRY_DSN: '',
  NEXT_PUBLIC_SENTRY_DSN: '',
  NEXT_PUBLIC_AMPLITUDE_API_KEY: '',
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
        'corepack yarn workspace @side/game-feedback db:test:sync && corepack yarn workspace @game-feedback/api db:seed && corepack yarn workspace @game-feedback/api test:server',
      cwd: rootDir,
      url: 'http://127.0.0.1:4302/api/session',
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command:
        'corepack yarn workspace @game-feedback/web build && corepack yarn workspace @game-feedback/web exec next start --port 3302 --hostname 127.0.0.1',
      cwd: rootDir,
      url: 'http://127.0.0.1:3302/ko',
      env: {
        ...apiEnv,
        NODE_ENV: 'production',
        GAME_FEEDBACK_API_URL: 'http://127.0.0.1:4302',
        NEXT_DIST_DIR: '.next/e2e-mobile',
        // 운영 빌드 웹은 앱 링크 값이 없으면 첫 요청부터 실패한다. 실제 앱과 연결되지 않는 테스트 값이다.
        MOBILE_APPLE_TEAM_ID: 'E2ETEAM000',
        MOBILE_IOS_BUNDLE_ID: 'test.e2e.gamefeedback',
        MOBILE_ANDROID_PACKAGE: 'test.e2e.gamefeedback',
        MOBILE_ANDROID_SHA256_FINGERPRINTS: Array.from({ length: 32 }, () => 'E2').join(':'),
      },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
