import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.browser.spec.ts',
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  timeout: 30_000,
  reporter: [['list']],
  outputDir: './test-results/components',
  use: { baseURL: 'http://127.0.0.1:3349', trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'safari', grep: /키보드|모션 감소/, use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'yarn exec vite --config vite.components.config.ts',
    url: 'http://127.0.0.1:3349',
    reuseExistingServer: false,
    timeout: 30_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
