import { defineConfig, devices } from '@playwright/test';

const origin = process.env.DEPLOY_SMOKE_ORIGIN;
if (!origin || !/^https:\/\/localhost:\d+$/.test(origin))
  throw new Error('배포 검증은 격리한 HTTPS localhost 컨테이너에서만 실행합니다.');

export default defineConfig({
  testDir: './test/deployment',
  testMatch: 'containers.e2e.ts',
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  // Docker 준비 대기 120초와 브라우저 복구 확인 45초를 함께 포함한다.
  timeout: 240_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  outputDir: 'test-results/deployment',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: origin,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  },
});
