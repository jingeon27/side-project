import { fileURLToPath } from 'node:url';

import { configDefaults, defineConfig } from 'vitest/config';

const integrationTests = ['src/**/*.integration.spec.ts', 'src/**/*.integration.test.ts'];

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
          exclude: [...configDefaults.exclude, ...integrationTests],
        },
      },
      {
        extends: true,
        test: { name: 'integration', include: integrationTests, testTimeout: 45_000 },
      },
    ],
  },
});
