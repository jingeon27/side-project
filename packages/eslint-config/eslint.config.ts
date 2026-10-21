import { baseConfig, tsconfigRootDir } from './src/base';

export default [
  { ignores: ['src/rules/__fixtures__/**'] },
  ...baseConfig,
  tsconfigRootDir(import.meta.dirname),
];
