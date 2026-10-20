import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{spec,test}.ts', 'orval.config.spec.ts'],
  },
});
