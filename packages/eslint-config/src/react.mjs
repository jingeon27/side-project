import { coreConfig } from './index.mjs';

/** React 플러그인은 Next·Expo 등 각 앱의 프레임워크 설정이 제공한다. */
export const reactConfig = [
  coreConfig,
  {
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
