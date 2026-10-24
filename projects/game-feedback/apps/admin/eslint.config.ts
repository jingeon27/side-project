import { fileURLToPath } from 'node:url';

import { defineConfig } from 'eslint/config';

import { testOverrides, tsconfigRootDir } from '@side/eslint-config/base';
import { fsdBoundaries } from '@side/eslint-config/fsd-boundaries';
import { reactDomConfig } from '@side/eslint-config/react-dom';

export default defineConfig([
  ...reactDomConfig,
  tsconfigRootDir(import.meta.dirname),
  ...fsdBoundaries(fileURLToPath(new URL('./src', import.meta.url))),
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'interface', format: ['PascalCase'], prefix: ['I'] },
        { selector: 'typeAlias', format: ['PascalCase'], prefix: ['T'] },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: 'TSEnumDeclaration', message: 'enum 대신 as const 객체와 유니온 타입을 사용하세요.' },
        {
          selector: "VariableDeclaration[kind='let']",
          message: 'const와 순수 변환을 우선하고 외부 가변 자원은 class로 캡슐화하세요.',
        },
        {
          selector:
            "CallExpression[callee.name=/^use(Query|SuspenseQuery|InfiniteQuery|SuspenseInfiniteQuery)$/] > ObjectExpression.arguments > Property[key.name='queryKey'] > ArrayExpression.value",
          message: 'queryKey는 도메인의 *.options.ts 팩토리에서 정의하고 재사용하세요.',
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(invalidateQueries|refetchQueries|cancelQueries|removeQueries|resetQueries|getQueriesData|setQueriesData)$/] > ObjectExpression.arguments > Property[key.name='queryKey'] > ArrayExpression.value",
          message: '캐시 작업에는 도메인 query options의 queryKey를 재사용하세요.',
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/features/*/api/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@game-feedback/sdk', message: 'REST 호출은 features의 api/*.api.ts에서 수행하세요.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/features/*/model/**', 'src/features/*/api/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@game-feedback/sdk', message: 'REST 호출은 features의 api/*.api.ts에서 수행하세요.' },
            {
              name: '@tanstack/react-query',
              importNames: ['mutationOptions'],
              message: 'mutationOptions는 features의 model에서 정의하고 호출부의 useMutation에 전달하세요.',
            },
          ],
        },
      ],
    },
  },
  ...testOverrides,
  { ignores: ['dist/**', 'test-results/**', 'playwright-report/**'] },
]);
