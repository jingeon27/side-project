import { defineConfig } from 'eslint/config';

import { baseConfig, tsconfigRootDir } from '@side/config/eslint/base';

export default defineConfig([...baseConfig, tsconfigRootDir(import.meta.dirname)]);
