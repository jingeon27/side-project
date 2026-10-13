import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import expoConfig from 'eslint-config-expo/flat.js';
import { defineConfig, globalIgnores } from 'eslint/config';

const TEST_FILES = [
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/*.test.ts',
  '**/*.test.tsx',
  'e2e/**/*.ts',
  'src/test/**/*.ts',
  'src/test/**/*.tsx',
];

export default defineConfig([
  globalIgnores([
    'node_modules/**',
    '.expo/**',
    '.expo-export-check/**',
    'android/**',
    'ios/**',
    'playwright-report/**',
    'test-results/**',
  ]),
  expoConfig,
  {
    settings: {
      // `@/*` 경로와 워크스페이스 패키지의 exports(@photo-contest/bridge/native)를 tsconfig 기준으로 찾는다.
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
        node: true,
      },
    },
  },
  {
    // eslint-config-expo는 .ts/.tsx만 TypeScript로 읽는다. vitest.config.mts도 같은 규칙으로 검사한다.
    files: ['**/*.mts'],
    plugins: { '@typescript-eslint': tsPlugin },
    languageOptions: { parser: tsParser },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
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
          // vitest의 ProvidedContext처럼 라이브러리 타입을 보강할 때는 원래 이름을 써야 한다.
          filter: { regex: '^ProvidedContext$', match: false },
        },
        { selector: 'typeAlias', format: ['PascalCase'], prefix: ['T'] },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportAllDeclaration', message: 'export * 대신 필요한 이름만 내보낸다.' },
        { selector: 'TSEnumDeclaration', message: 'enum 대신 as const 객체를 쓴다.' },
      ],
      'react/function-component-definition': [
        'error',
        { namedComponents: 'function-declaration', unnamedComponents: 'arrow-function' },
      ],
      'react/jsx-handler-names': ['error', { eventHandlerPrefix: 'handle', eventHandlerPropPrefix: 'on' }],
    },
  },
  {
    // 앱 코드는 named export만 쓴다. 설정 파일(app.config.ts 등)은 도구가 default export를 요구한다.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: { 'import/no-default-export': 'error' },
  },
  {
    files: TEST_FILES,
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
]);
