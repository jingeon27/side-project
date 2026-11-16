import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e-dev',
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/dev' }]],
  use: {
    baseURL: 'http://127.0.0.1:3102',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'NEXT_DIST_DIR=.next/e2e-dev yarn next dev --port 3102 --hostname 127.0.0.1',
    url: 'http://127.0.0.1:3102/ko',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
