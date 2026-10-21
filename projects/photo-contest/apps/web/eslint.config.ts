import { tsconfigRootDir } from '@side/eslint-config/base';
import { fsdBoundaries } from '@side/eslint-config/fsd-boundaries';
import { nextConfig } from '@side/eslint-config/next';
import { defineConfig } from 'eslint/config';
import { fileURLToPath } from 'node:url';

export default defineConfig([
  ...nextConfig,
  tsconfigRootDir(import.meta.dirname),
  ...fsdBoundaries(fileURLToPath(new URL('./src', import.meta.url))),
]);
