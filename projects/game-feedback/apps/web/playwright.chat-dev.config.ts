import { defineConfig } from '@playwright/test';

import base from './playwright.config';

if (!Array.isArray(base.webServer)) throw new Error('API와 웹 서버가 필요합니다.');
export default defineConfig({
  ...base,
  testDir: './e2e-dev',
  testIgnore: [],
  outputDir: '.e2e-build/chat-dev-results',
  webServer: base.webServer.map((server, index) => ({
    ...server,
    ...(index === 1
      ? {
          command: 'yarn workspace @game-feedback/web exec next dev --port 3301 --hostname 127.0.0.1',
          env: { ...server.env, NODE_ENV: 'development' },
        }
      : {}),
  })),
});
