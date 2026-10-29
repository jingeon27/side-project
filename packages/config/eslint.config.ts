import { baseConfig, tsconfigRootDir } from './eslint/src/base';

export default [
  { ignores: ['eslint/src/**/__fixtures__/**'] },
  ...baseConfig,
  tsconfigRootDir(import.meta.dirname),
];
