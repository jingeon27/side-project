import type { Linter } from 'eslint';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

import { testOverrides } from './base';
import { reactConfig } from './react';

export const nextConfig: Linter.Config[] = [
  ...nextVitals,
  ...nextTypescript,
  ...reactConfig,
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
