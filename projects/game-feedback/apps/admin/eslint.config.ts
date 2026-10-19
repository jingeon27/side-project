import { defineConfig } from 'eslint/config';
import { reactConfig } from '@side/eslint-config/react';
import { fsdBoundaries } from '@side/eslint-config/fsd-boundaries';
import { fileURLToPath } from 'node:url';
export default defineConfig([
  ...reactConfig,
  ...fsdBoundaries(fileURLToPath(new URL('./src', import.meta.url))),
  { ignores: ['dist/**', 'test-results/**', 'playwright-report/**'] },
]);
