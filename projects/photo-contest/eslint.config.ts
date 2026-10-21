import { baseConfig, tsconfigRootDir } from '@side/eslint-config/base';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  { ignores: ['apps/web/**', 'apps/mobile/**'] },
  ...baseConfig,
  tsconfigRootDir(import.meta.dirname),
]);
