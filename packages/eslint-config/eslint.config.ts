import tseslint from 'typescript-eslint';
import { coreConfig } from './src/index';
export default [
  { ignores: ['test/fixtures/**', 'coverage/**'] },
  ...tseslint.configs.recommended,
  coreConfig,
];
