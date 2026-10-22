import type { Linter } from 'eslint';
import react from 'eslint-plugin-react';

import { baseConfig } from './base';

// 한 번 쓰는 핸들러는 JSX에 인라인으로 두고, 분리한 핸들러는 handle*, 받은 props 콜백은 on*으로 넘긴다.
// checkLocalVariables가 없으면 `onClick={submit}` 같은 지역 함수는 검사하지 않고 멤버식만 걸린다.
export const jsxHandlerNamesOptions = {
  eventHandlerPrefix: '(?:handle|on)',
  eventHandlerPropPrefix: 'on',
  checkLocalVariables: true,
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
