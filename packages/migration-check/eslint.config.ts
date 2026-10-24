import { defineConfig } from 'eslint/config';

import { baseConfig, tsconfigRootDir } from '@side/eslint-config/base';

export default defineConfig([...baseConfig, tsconfigRootDir(import.meta.dirname)]);
