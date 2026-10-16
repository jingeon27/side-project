import { expoConfig } from '@side/eslint-config/expo';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  ...expoConfig,
  {
    settings: {
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
        node: true,
      },
    },
  },
]);
