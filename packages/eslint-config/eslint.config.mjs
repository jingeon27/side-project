import tseslint from 'typescript-eslint';
import { coreConfig } from './src/index.mjs';
export default [
  { ignores: ['test/fixtures/**', 'coverage/**'] },
  ...tseslint.configs.recommended,
  coreConfig,
];
