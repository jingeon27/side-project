import { defineConfig } from '@playwright/test';

import base from './playwright.config';

if (!Array.isArray(base.webServer)) throw new Error('별도 격리 API와 웹 서버가 필요합니다.');
// Playwright의 실패 시 자동 DOM snapshot에도 대화 원문을 남기지 않는다.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';

export default defineConfig({
  ...base,
  testDir: './e2e-benchmark',
  testMatch: '**/chat-delivery.spec.ts',
  testIgnore: [],
  workers: 1,
  retries: 0,
  repeatEach: 1,
  timeout: 600_000,
  outputDir: '.e2e-build/chat-benchmark-results',
  captureGitInfo: { commit: false, diff: false },
  reporter: [['./e2e-benchmark/reporter.ts']],
  use: {
    baseURL: 'http://127.0.0.1:3301',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  webServer: base.webServer.map((server) => ({
    ...server,
    stdout: 'ignore',
    stderr: 'ignore',
    env: {
      ...server.env,
      PUSH_NOTIFICATIONS_ENABLED: 'false',
      EXPO_ACCESS_TOKEN: '',
    },
  })),
});
