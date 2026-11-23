import { defineConfig } from '@playwright/test';

const port = 43738;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  use: { baseURL },
  webServer: {
    command: `yarn dev --host 127.0.0.1 --port ${port} --strictPort`,
    env: { VITE_AMPLITUDE_API_KEY: '' },
    url: baseURL,
    reuseExistingServer: false,
  },
});
