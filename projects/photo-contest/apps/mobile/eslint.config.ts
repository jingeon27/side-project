import { defineConfig } from 'eslint/config';

import { tsconfigRootDir } from '@side/eslint-config/base';
import { expoConfig } from '@side/eslint-config/expo';

export default defineConfig([
  ...expoConfig,
  tsconfigRootDir(import.meta.dirname),
  {
    settings: {
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
        node: true,
      },
    },
  },
]);
