import { testOverrides, tsconfigRootDir } from '@side/config/eslint/base';
import { reactDomConfig } from '@side/config/eslint/react-dom';

export default [...reactDomConfig, ...testOverrides, tsconfigRootDir(import.meta.dirname)];
