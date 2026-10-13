// apps/web 전용 ESLint 설정. 프로젝트 공용 설정에 기대지 않는다.
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

import fsdBoundaries from './eslint/fsd-boundaries.mjs';

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    '.next/**',
    'next-env.d.ts',
    'src/modules/shared/api/generated.ts',
    'playwright-report/**',
    'test-results/**',
    'coverage/**',
  ]),
  {
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'],
    plugins: { fsd: fsdBoundaries },
    rules: {
      'fsd/layer-imports': 'error',
      'fsd/slice-public-api': 'error',
      'fsd/no-cross-page': 'error',
      'react/function-component-definition': [
        'error',
        { namedComponents: 'function-declaration', unnamedComponents: 'arrow-function' },
      ],
      'react/jsx-no-useless-fragment': ['error', { allowExpressions: true }],
      'react/jsx-pascal-case': 'error',
      'react/jsx-handler-names': ['error', { eventHandlerPrefix: 'handle', eventHandlerPropPrefix: 'on' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unused-expressions': 'error',
    },
  },
  {
    // 테스트는 준비 코드에서 값이 있음을 단언할 수 있다.
    files: ['**/*.spec.{ts,tsx}', '**/*.test.{ts,tsx}', 'e2e/**', 'vitest.*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
]);
