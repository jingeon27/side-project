import type { Linter } from 'eslint';
import { createRequire } from 'node:module';
import { parser, plugin } from 'typescript-eslint';

import { testFiles, testOverrides } from './base';
import { reactConfig } from './react';

// Expo의 flat 설정은 타입 선언이 없는 CommonJS 모듈이다.
const expo: Linter.Config[] = createRequire(import.meta.url)('eslint-config-expo/flat.js');

export const expoConfig: Linter.Config[] = [
  { ignores: ['.expo/**', '.expo-export-check/**', 'android/**', 'ios/**'] },
  ...expo,
  ...reactConfig,
  {
    files: ['**/*.mts'],
    plugins: { '@typescript-eslint': plugin },
    languageOptions: { parser },
  },
  {
    name: 'side/expo',
    files: ['**/*.{ts,tsx,mts}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'separate-type-imports' }],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'interface',
          format: ['PascalCase'],
          prefix: ['I'],
          filter: { regex: '^ProvidedContext$', match: false },
        },
        { selector: 'typeAlias', format: ['PascalCase'], prefix: ['T'] },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportAllDeclaration', message: 'export * 대신 필요한 이름만 내보낸다.' },
        { selector: 'TSEnumDeclaration', message: 'enum 대신 as const 객체를 쓴다.' },
      ],
    },
  },
  { files: ['src/**/*.{ts,tsx}'], rules: { 'import/no-default-export': 'error' } },
  ...testOverrides,
  { files: testFiles, rules: { '@typescript-eslint/no-explicit-any': 'off' } },
];
