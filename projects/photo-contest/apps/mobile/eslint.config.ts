import { fileURLToPath } from 'node:url';

import { defineConfig } from 'eslint/config';

import { tsconfigRootDir } from '@side/eslint-config/base';
import { expoConfig } from '@side/eslint-config/expo';
import { fsdBoundaries } from '@side/eslint-config/fsd-boundaries';

export default defineConfig([
  ...expoConfig,
  tsconfigRootDir(import.meta.dirname),
  ...fsdBoundaries(fileURLToPath(new URL('./src', import.meta.url))),
  {
    settings: {
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
        node: true,
      },
    },
  },
]);
