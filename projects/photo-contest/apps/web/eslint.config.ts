import { fileURLToPath } from 'node:url';

import { defineConfig } from 'eslint/config';

import { tsconfigRootDir } from '@side/config/eslint/base';
import { fsdBoundaries } from '@side/config/eslint/fsd-boundaries';
import { nextConfig } from '@side/config/eslint/next';

export default defineConfig([
  ...nextConfig,
  tsconfigRootDir(import.meta.dirname),
  ...fsdBoundaries(fileURLToPath(new URL('./src', import.meta.url))),
]);
