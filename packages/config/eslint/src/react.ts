import type { Linter } from 'eslint';
import react from 'eslint-plugin-react';

import { baseConfig } from './base';
import { sidePlugin } from './plugin';

export const handlerNamesConfig: Linter.Config = {
  name: 'side/handler-names',
  plugins: { side: sidePlugin },
  rules: { 'side/handler-names': 'error' },
};

export const reactConfig: Linter.Config[] = [
  ...baseConfig,
  handlerNamesConfig,
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
      'side/no-component-fetch': 'error',
    },
  },
];
