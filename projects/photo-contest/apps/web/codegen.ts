import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  schema: '../api/src/**/*.graphql',
  documents: ['src/features/**/*.graphql'],
  generates: {
    'src/shared/api/generated.ts': {
      plugins: ['typescript', 'typescript-operations', 'typed-document-node'],
      config: {
        useTypeImports: true,
        enumsAsConst: true,
        // 화면에서 쓰는 연산 타입만 내보내 스키마 전체 타입에 기대지 않게 한다.
        onlyOperationTypes: true,
        avoidOptionals: { field: true, inputValue: false },
        nonOptionalTypename: true,
        skipTypeNameForRoot: true,
        defaultScalarType: 'unknown',
        scalars: { DateTime: { input: 'string', output: 'string' } },
      },
    },
  },
};

export default config;
