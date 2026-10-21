import { defineConfig } from 'eslint/config';

import { baseConfig, tsconfigRootDir } from '@side/eslint-config/base';

export default defineConfig([
  { ignores: ['apps/web/**', 'apps/mobile/**'] },
  ...baseConfig,
  tsconfigRootDir(import.meta.dirname),
]);
