import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  schema: '../api/src/**/*.graphql',
  documents: ['src/features/**/*.graphql'],
  generates: {
    'src/shared/api/generated.ts': {
      plugins: ['typescript-operations', 'typed-document-node'],
      config: {
        useTypeImports: true,
        enumType: 'const',
        avoidOptionals: { inputValue: false },
        nonOptionalTypename: true,
        skipTypeNameForRoot: true,
        defaultScalarType: 'unknown',
        scalars: {
          ID: { input: 'string', output: 'string' },
          DateTime: { input: 'string', output: 'string' },
        },
      },
    },
  },
};

export default config;
