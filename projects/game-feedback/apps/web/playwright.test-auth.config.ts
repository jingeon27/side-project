import { defineConfig } from '@playwright/test';

import baseConfig from './playwright.config';

if (!Array.isArray(baseConfig.webServer)) throw new Error('Test authentication requires both owned servers.');

export default defineConfig({
  ...baseConfig,
  testMatch: '**/test-token-chat.spec.ts',
  testIgnore: [],
  outputDir: '.e2e-build/test-auth-results',
  webServer: baseConfig.webServer.map((server, index) => ({
    ...server,
    ...(index === 0 ? { command: `${server.command} --no-demo` } : {}),
  })),
});
