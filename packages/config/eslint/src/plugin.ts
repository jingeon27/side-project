import type { ESLint } from 'eslint';

import { noElse } from './rules/common/no-else/no-else';
import { noWildcardExports } from './rules/common/no-wildcard-exports/no-wildcard-exports';
import { noComponentFetch } from './rules/web/no-component-fetch/no-component-fetch';
import { noOverlayState } from './rules/web/no-overlay-state/no-overlay-state';

const commonRules = { 'no-else': noElse, 'no-wildcard-exports': noWildcardExports };
const webRules = { 'no-component-fetch': noComponentFetch, 'no-overlay-state': noOverlayState };

// ESLint flat config는 같은 이름의 플러그인을 다른 객체로 다시 등록하면 `Cannot redefine plugin "side"` 오류를 낸다.
// 모든 분류의 규칙을 이 객체 하나에 모으고, preset은 이 객체를 등록한 뒤 자기 분류의 규칙만 켠다.
// typescript-eslint의 AST 타입은 ESLint 플러그인 등록 경계에서만 맞춘다.
export const sidePlugin = {
  meta: { name: '@side/config', version: '0.0.0' },
  rules: { ...commonRules, ...webRules },
} as unknown as ESLint.Plugin;
