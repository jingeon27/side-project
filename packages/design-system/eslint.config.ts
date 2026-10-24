import { testOverrides, tsconfigRootDir } from '@side/eslint-config/base';
import { reactDomConfig } from '@side/eslint-config/react-dom';

export default [...reactDomConfig, ...testOverrides, tsconfigRootDir(import.meta.dirname)];
