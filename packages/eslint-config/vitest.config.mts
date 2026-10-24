import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{spec,test}.ts'],
    exclude: [...configDefaults.exclude, '**/__fixtures__/**'],
    setupFiles: ['./src/test/setup.ts'],
    maxWorkers: 2,
  },
});
