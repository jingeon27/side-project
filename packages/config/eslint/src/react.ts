import type { Linter } from 'eslint';
import react from 'eslint-plugin-react';

import { baseConfig } from './base';
import { sidePlugin } from './plugin';

export const handlerNamesConfig: Linter.Config = {
  name: 'side/jsx-handler-names',
  // React preset 또는 Next가 소유한 플러그인을 재등록하지 않고 옵션만 추가한다.
  rules: {
    'react/jsx-handler-names': [
      'error',
      {
        eventHandlerPrefix: '(?:handle|on|fetchNext)',
        eventHandlerPropPrefix: 'on',
        // 함수의 출처를 구분하지 못하므로 로컬 함수와 인라인 콜백은 리뷰에서 이름을 확인한다.
        checkLocalVariables: false,
        checkInlineFunction: false,
      },
    ],
  },
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
