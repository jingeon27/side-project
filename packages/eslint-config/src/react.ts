import type { Linter } from 'eslint';
import react from 'eslint-plugin-react';

import { baseConfig } from './base';

// spec이 같은 옵션으로 규칙을 검증하도록 preset 옵션을 상수로 둔다.
export const jsxHandlerNamesOptions = {
  eventHandlerPrefix: 'handle',
  eventHandlerPropPrefix: 'on',
  checkInlineFunction: false,
} as const;

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
      'react/jsx-handler-names': ['error', jsxHandlerNamesOptions],
      'side/no-component-fetch': 'error',
    },
  },
];
