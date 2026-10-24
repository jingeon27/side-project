import { baseConfig, tsconfigRootDir } from './src/base';

export default [{ ignores: ['src/**/__fixtures__/**'] }, ...baseConfig, tsconfigRootDir(import.meta.dirname)];
