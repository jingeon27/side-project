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
        eventHandlerPrefix: '(?:handle|on|fetchNext|mutate)',
        eventHandlerPropPrefix: 'on',
        // 로컬 식별자·인라인 콜백은 제외하고 직접 작성한 handle* 관례는 리뷰로 확인한다.
        checkLocalVariables: false,
        checkInlineFunction: false,
      },
    ],
  },
};

/**
 * 훅 의존성 누락은 recommended의 경고로 두면 lint가 막지 못하므로 오류로 올린다.
 * 플러그인은 등록하지 않으니 react-hooks를 등록한 설정(Next·Expo·reactDomConfig) 뒤에 둔다.
 */
export const hooksDependencyConfig: Linter.Config = {
  name: 'side/react-hooks-deps',
  rules: { 'react-hooks/exhaustive-deps': 'error' },
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
      'side/no-form-state-copy': 'error',
    },
  },
];
