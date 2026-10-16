import type { Linter } from 'eslint';
import react from 'eslint-plugin-react';

import { baseConfig } from './base';

export const reactConfig: Linter.Config[] = [
  ...baseConfig,
  {
    plugins: { react },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/function-component-definition': [
        'error',
        { namedComponents: 'function-declaration', unnamedComponents: 'arrow-function' },
      ],
      'react/jsx-handler-names': [
        'error',
        { eventHandlerPrefix: 'handle', eventHandlerPropPrefix: 'on', checkInlineFunction: false },
      ],
      'side/no-component-fetch': 'error',
    },
  },
];
