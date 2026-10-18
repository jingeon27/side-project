import { reactConfig } from '@side/eslint-config/react';
import { testOverrides } from '@side/eslint-config/base';

export default [...reactConfig, ...testOverrides];
