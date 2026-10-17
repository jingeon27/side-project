import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

if (!Array.isArray(baseConfig.webServer)) throw new Error('Test authentication requires both owned servers.');

export default defineConfig({
  ...baseConfig,
  testMatch: '**/test-token-chat.spec.ts',
  testIgnore: [],
  outputDir: '.e2e-build/test-auth-results',
  webServer: baseConfig.webServer.map((server) => ({
    ...server,
    env: { ...server.env, GF_DEMO_MODE: 'false', GF_TEST_AUTH_ENABLED: 'true' },
  })),
});
