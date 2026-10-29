import { defineConfig } from 'vitest/config';

const integrationFiles = ['src/**/*.integration.{spec,test}.ts'];
const databaseOnly = process.argv.some(
  (argument) => argument === 'database' || argument === '--project=database',
);

export default defineConfig({
  test: {
    projects: [
      ...(databaseOnly
        ? [
            {
              extends: true as const,
              test: {
                name: 'database',
                environment: 'node' as const,
                testTimeout: 30_000,
                hookTimeout: 60_000,
                include: [
                  'src/**/*.database.integration.{spec,test}.ts',
                  'src/auth/account-withdrawal.service.integration.test.ts',
                ],
                globalSetup: ['./scripts/integration-setup.ts'],
              },
            },
          ]
        : []),
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'src/**/*.{spec,test}.ts',
            'scripts/**/*.{spec,test}.ts',
            '../../scripts/**/*.{spec,test}.ts',
          ],
          exclude: integrationFiles,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          testTimeout: 30_000,
          hookTimeout: 60_000,
          include: integrationFiles,
          globalSetup: ['./scripts/integration-setup.ts'],
        },
      },
    ],
  },
});
