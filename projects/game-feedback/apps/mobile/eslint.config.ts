import { fileURLToPath } from 'node:url';

import { defineConfig } from 'eslint/config';

import { tsconfigRootDir } from '@side/config/eslint/base';
import { expoConfig } from '@side/config/eslint/expo';
import { fsdBoundaries } from '@side/config/eslint/fsd-boundaries';

export default defineConfig([
  ...expoConfig,
  tsconfigRootDir(import.meta.dirname),
  ...fsdBoundaries(fileURLToPath(new URL('./src', import.meta.url))),
  { settings: { 'import/resolver': { typescript: { project: './tsconfig.json' }, node: true } } },
]);
