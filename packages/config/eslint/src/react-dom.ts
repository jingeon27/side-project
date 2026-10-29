import { createRequire } from 'node:module';

import type { ESLint, Linter } from 'eslint';

import { reactConfig } from './react';

interface IJsxA11yPlugin extends ESLint.Plugin {
  flatConfigs: { recommended: Linter.Config };
}

// eslint-plugin-jsx-a11y는 타입 선언이 없는 CommonJS 모듈이다.
const jsxA11y: IJsxA11yPlugin = createRequire(import.meta.url)('eslint-plugin-jsx-a11y');

// @side/design-system의 입력 컴포넌트는 네이티브 input·textarea·select(Checkbox는 숨긴 input)를 렌더해 label 안에 두면 연결된다.
// Label 프리미티브는 사용하는 곳에서 htmlFor나 안의 입력으로 연결했는지 검사한다.
export const labelAssociationOptions = {
  labelComponents: ['Label'],
  controlComponents: ['Input', 'Textarea', 'NativeSelect', 'Checkbox'],
};

// DOM 요소의 접근성 규칙이라 React Native(Expo)에는 걸지 않는다.
export const jsxA11yRules: Linter.RulesRecord = {
  ...jsxA11y.flatConfigs.recommended.rules,
  'jsx-a11y/label-has-associated-control': ['error', labelAssociationOptions],
};

/** Next를 쓰지 않는 React DOM 앱(Vite·디자인 시스템). Next 앱은 nextConfig가 같은 규칙을 더한다. */
export const reactDomConfig: Linter.Config[] = [
  ...reactConfig,
  { name: 'side/jsx-a11y', plugins: { 'jsx-a11y': jsxA11y }, rules: jsxA11yRules },
];
