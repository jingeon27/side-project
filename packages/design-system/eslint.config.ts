import { reactConfig } from '@side/eslint-config/react';
import { testOverrides, tsconfigRootDir } from '@side/eslint-config/base';

export default [...reactConfig, ...testOverrides, tsconfigRootDir(import.meta.dirname)];
