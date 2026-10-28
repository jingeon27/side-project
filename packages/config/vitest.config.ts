import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    maxWorkers: 2,
    projects: [
      {
        extends: true,
        test: {
          name: 'eslint',
          environment: 'node',
          include: ['eslint/src/**/*.{spec,test}.ts'],
          exclude: [...configDefaults.exclude, '**/__fixtures__/**'],
          setupFiles: ['./eslint/src/test/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'tooling',
          environment: 'node',
          globals: true,
          include: [
            '../../scripts/check-commit-message.spec.ts',
            '../../scripts/check-branch-commits.spec.ts',
            '../../scripts/knip-baseline.spec.ts',
          ],
        },
      },
    ],
  },
});
