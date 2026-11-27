import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3461';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'yarn exec next dev --hostname 127.0.0.1 --port 3461',
    env: {
      NEXT_DIST_DIR: '.data/e2e-next',
      NEXT_PUBLIC_DEOKDAM_AMPLITUDE_KEY: '',
      DEOKDAM_AI_API_KEY: '',
      DEOKDAM_AI_MODEL: '',
      DEOKDAM_SHORTS_PLAYLIST_ID: 'PLdeokdam-test-playlist00',
      DEOKDAM_PORTONE_API_SECRET: '',
      DEOKDAM_REWARDED_AD_UNIT: '/test/deokdam-reward',
    },
    url: baseURL,
    reuseExistingServer: false,
  },
});
