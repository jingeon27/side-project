import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:3320', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'yarn workspace @photo-contest/api build && yarn workspace @photo-contest/api start',
      url: 'http://127.0.0.1:4320/auth/config',
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        NODE_ENV: 'development',
        ENABLE_DEV_LOGIN: 'true',
        PORT: '4320',
        WEB_ORIGIN: 'http://localhost:3320',
        STORAGE_DIR: process.env.STORAGE_DIR!,
      },
    },
    {
      command: 'yarn workspace @photo-contest/web exec next dev -p 3320',
      url: 'http://localhost:3320',
      reuseExistingServer: false,
      timeout: 60000,
      env: { NODE_ENV: 'development', API_URL: 'http://127.0.0.1:4320', WEB_ORIGIN: 'http://localhost:3320' },
    },
  ],
});
