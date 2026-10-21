import { fileURLToPath } from 'node:url';

import { defineConfig } from 'eslint/config';

import { tsconfigRootDir } from '@side/eslint-config/base';
import { fsdBoundaries } from '@side/eslint-config/fsd-boundaries';
import { nextConfig } from '@side/eslint-config/next';

export default defineConfig([
  ...nextConfig,
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
      'no-restricted-syntax': [
        'error',
        { selector: 'TSEnumDeclaration', message: 'enum 대신 as const 객체와 유니온 타입을 사용하세요.' },
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
    files: ['src/{_app,_pages,widgets,features,shared}/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: '@game-feedback/sdk', message: 'REST 호출은 도메인 api/*.api.ts에서 수행하세요.' }],
        },
      ],
    },
  },
]);
