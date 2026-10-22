import type { Linter } from 'eslint';
import react from 'eslint-plugin-react';

import { baseConfig } from './base';
import { sidePlugin } from './plugin';

// spec이 같은 옵션으로 규칙을 검증하도록 preset 옵션을 상수로 둔다.
export const jsxHandlerNamesOptions = {
  eventHandlerPrefix: 'handle',
  eventHandlerPropPrefix: 'on',
  checkInlineFunction: false,
} as const;

export const reactConfig: Linter.Config[] = [
  ...baseConfig,
  {
    name: 'side/react',
    // baseConfig와 같은 플러그인 객체라 다시 등록해도 충돌하지 않는다. web 규칙은 여기서부터 켠다.
    plugins: { react, side: sidePlugin },
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
