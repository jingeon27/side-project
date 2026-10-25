import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { defineConfig, devices } from '@playwright/test';

import { apiWebServer, prepareE2eDatabase } from '@photo-contest/test-kit';

const settings = parseEnv(readFileSync(new URL('../../.env', import.meta.url), 'utf8'));
const dsn = settings.NEXT_PUBLIC_SENTRY_DSN?.trim();
const apiKey = settings.NEXT_PUBLIC_AMPLITUDE_API_KEY?.trim();
if (!dsn || !apiKey) throw new Error('프로젝트 .env의 웹 Sentry·Amplitude 키가 필요합니다.');
Object.assign(process.env, { NEXT_PUBLIC_SENTRY_DSN: dsn, NEXT_PUBLIC_AMPLITUDE_API_KEY: apiKey });
const webOrigin = 'http://127.0.0.1:3336';

// 실제 전송은 이 명령에서만 켠다. 기본 e2e와 다른 포트·별도 DB 스키마를 쓴다.
export default defineConfig({
  testDir: './test/monitoring',
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: 'list',
  use: { baseURL: webOrigin, trace: 'off', screenshot: 'off', video: 'off' },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: [
    apiWebServer({ port: 4336, webOrigin, database: prepareE2eDatabase('web_e2e') }),
    {
      command: 'yarn build && yarn exec node ../../../../scripts/serve-monitoring-build.ts',
      url: `${webOrigin}/privacy`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
      gracefulShutdown: { signal: 'SIGTERM', timeout: 20_000 },
      env: {
        NODE_ENV: 'production',
        WEB_ORIGIN: webOrigin,
        API_URL: 'http://127.0.0.1:4336',
        SENTRY_DSN: '',
        NEXT_PUBLIC_SENTRY_DSN: dsn,
        NEXT_PUBLIC_AMPLITUDE_API_KEY: apiKey,
      },
    },
  ],
});
