import { defineConfig } from 'eslint/config';

import { baseConfig, tsconfigRootDir } from '@side/config/eslint/base';

export default defineConfig([
  { ignores: ['apps/web/**', 'apps/mobile/**'] },
  ...baseConfig,
  tsconfigRootDir(import.meta.dirname),
]);
