import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  timeout: 45_000,
  use: { baseURL: 'http://127.0.0.1:3411', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1080 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'NEXT_DIST_DIR=.e2e-build yarn next dev --hostname 127.0.0.1 --port 3411',
    url: 'http://127.0.0.1:3411',
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      DASHSCOPE_API_KEY: '',
      STORY_STUDIO_PROVIDER: 'cloud',
      STORY_STUDIO_DATA_DIR: path.join(process.cwd(), '.data', 'e2e'),
      NEXT_PUBLIC_STORY_STUDIO_AMPLITUDE_KEY: '',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
