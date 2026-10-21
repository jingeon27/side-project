import { testOverrides, tsconfigRootDir } from '@side/eslint-config/base';
import { reactConfig } from '@side/eslint-config/react';

export default [...reactConfig, ...testOverrides, tsconfigRootDir(import.meta.dirname)];
