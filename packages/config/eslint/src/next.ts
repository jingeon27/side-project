import type { Linter } from 'eslint';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

import { testOverrides } from './base';
import { reactConfig } from './react';
import { jsxA11yRules } from './react-dom';

export const nextConfig: Linter.Config[] = [
  ...nextVitals,
  ...nextTypescript,
  ...reactConfig,
  // eslint-config-next가 jsx-a11y 플러그인을 다른 객체로 이미 등록해 다시 등록하면 충돌하므로 규칙만 더한다.
  { name: 'side/jsx-a11y', rules: jsxA11yRules },
  {
    name: 'side/next',
    rules: {
      'side/no-overlay-state': 'error',
      'react/jsx-no-useless-fragment': ['error', { allowExpressions: true }],
      'react/jsx-pascal-case': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unused-expressions': 'error',
    },
  },
  ...testOverrides,
];
