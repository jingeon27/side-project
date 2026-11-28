import { fileURLToPath } from 'node:url';

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
      DEOKDAM_ACCOUNT_DB: fileURLToPath(new URL('./.data/e2e-accounts.sqlite', import.meta.url)),
      DEOKDAM_PUBLIC_ORIGIN: baseURL,
      DEOKDAM_GOOGLE_CLIENT_ID: 'deokdam-google-test',
      DEOKDAM_GOOGLE_CLIENT_SECRET: 'test-only',
      DEOKDAM_KAKAO_CLIENT_ID: 'deokdam-kakao-test',
      DEOKDAM_KAKAO_CLIENT_SECRET: 'test-only',
      NEXT_DIST_DIR: '.data/e2e-next',
      NEXT_PUBLIC_DEOKDAM_AMPLITUDE_KEY: '',
      DEOKDAM_AI_CONTAINER: '',
      DEOKDAM_AI_MODEL: '',
      DEOKDAM_SHORTS_PLAYLIST_ID: 'PLdeokdam-test-playlist00',
      DEOKDAM_PORTONE_API_SECRET: '',
      DEOKDAM_REWARDED_AD_UNIT: '/test/deokdam-reward',
    },
    url: baseURL,
    reuseExistingServer: false,
  },
});
