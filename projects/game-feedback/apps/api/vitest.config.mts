import { defineConfig } from 'vitest/config';

const integrationFiles = ['src/**/*.integration.{spec,test}.ts'];

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.{spec,test}.ts', '../../scripts/**/*.{spec,test}.ts'],
          exclude: integrationFiles,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: integrationFiles,
          globalSetup: ['./scripts/integration-setup.mjs'],
        },
      },
    ],
  },
});
