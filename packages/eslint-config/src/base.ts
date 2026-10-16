import type { ESLint, Linter } from 'eslint';
import tseslint from 'typescript-eslint';

import { noComponentFetch } from './rules/no-component-fetch';
import { noElse } from './rules/no-else';
import { noOverlayState } from './rules/no-overlay-state';

export const buildArtifactIgnores = [
  '**/node_modules/**',
  '**/.next/**',
  '**/dist/**',
  '**/generated.ts',
  '**/generated/**',
  '**/next-env.d.ts',
  '**/.data/**',
  '**/playwright-report/**',
  '**/test-results/**',
  '**/.e2e-build/**',
  '**/coverage/**',
];

export const testFiles = [
  '**/*.spec.{ts,tsx}',
  '**/*.test.{ts,tsx}',
  '**/e2e/**',
  '**/src/test/**',
  '**/vitest.*.{ts,mts}',
];

// typescript-eslint의 AST 타입은 ESLint 플러그인 등록 경계에서만 맞춘다.
const plugin = {
  meta: { name: '@side/eslint-config', version: '0.0.0' },
  rules: {
    'no-else': noElse,
    'no-component-fetch': noComponentFetch,
    'no-overlay-state': noOverlayState,
  },
} as unknown as ESLint.Plugin;

export const baseConfig: Linter.Config[] = [
  { ignores: buildArtifactIgnores },
  ...tseslint.configs.recommended,
  {
    name: 'side/base',
    plugins: { side: plugin },
    rules: {
      'side/no-else': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];

export const testOverrides: Linter.Config[] = [
  { files: testFiles, rules: { '@typescript-eslint/no-non-null-assertion': 'off' } },
];
