import { defineConfig, devices } from '@playwright/test';

/** 실제 UI와 SDK를 실행하고 API 경계만 브라우저에서 대체한다. DB·운영 터널은 사용하지 않는다. */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'ui/**/*.test.ts',
  workers: 1,
  timeout: 45_000,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3305', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'yarn dev --port 3305',
    url: 'http://127.0.0.1:3305',
    reuseExistingServer: false,
    env: { GAME_FEEDBACK_API_URL: 'http://127.0.0.1:9', WEB_ORIGIN: 'http://127.0.0.1:3305' },
  },
});
