import { createRequire } from 'node:module';

import type { ESLint, Linter } from 'eslint';
import reactHooks from 'eslint-plugin-react-hooks';

import { hooksDependencyConfig, reactConfig } from './react';

interface IJsxA11yPlugin extends ESLint.Plugin {
  flatConfigs: { recommended: Linter.Config };
}

// eslint-plugin-jsx-a11y는 타입 선언이 없는 CommonJS 모듈이다.
const jsxA11y: IJsxA11yPlugin = createRequire(import.meta.url)('eslint-plugin-jsx-a11y');

// @side/design-system의 입력 컴포넌트는 네이티브 input·textarea·select(Checkbox는 숨긴 input)를 렌더해 label 안에 두면 연결된다.
// 디자인 시스템에는 Label 컴포넌트가 없다(레이블은 FormField·TextField가 연결). 만들면 labelComponents에 함께 더한다.
export const labelAssociationOptions = {
  controlComponents: ['Input', 'Textarea', 'NativeSelect', 'Checkbox'],
};

// DOM 요소의 접근성 규칙이라 React Native(Expo)에는 걸지 않는다.
export const jsxA11yRules: Linter.RulesRecord = {
  ...jsxA11y.flatConfigs.recommended.rules,
  'jsx-a11y/label-has-associated-control': ['error', labelAssociationOptions],
};

// 디자인 시스템 색 토큰을 className으로 고르는 DOM 화면의 규칙이다. Expo 화면은 className을 쓰지 않는다.
export const domStyleRules: Linter.RulesRecord = { 'side/no-subtle-text': 'error' };

/** Next를 쓰지 않는 React DOM 앱(Vite·디자인 시스템). Next 앱은 nextConfig가 같은 규칙을 더한다. */
export const reactDomConfig: Linter.Config[] = [
  ...reactConfig,
  // Next·Expo preset은 eslint-config-next·expo가 같은 recommended로 등록하므로 여기서만 등록한다.
  // 플러그인 객체의 configs가 ESLint.Plugin 타입과 맞지 않아, 같은 객체를 담은 플러그인 자체의 flat 설정을 쓴다.
  { name: 'side/react-hooks', ...reactHooks.configs.flat.recommended },
  hooksDependencyConfig,
  { name: 'side/jsx-a11y', plugins: { 'jsx-a11y': jsxA11y }, rules: jsxA11yRules },
  { name: 'side/dom-style', rules: domStyleRules },
];
