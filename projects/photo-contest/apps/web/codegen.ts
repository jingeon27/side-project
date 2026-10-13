import type { CodegenConfig } from '@graphql-codegen/cli';
const config: CodegenConfig = {
  schema: '../api/src/schema.graphql',
  documents: ['src/features/**/*.graphql'],
  generates: {
    'src/shared/api/generated.ts': {
      plugins: ['typescript', 'typescript-operations', 'typed-document-node'],
      config: { scalars: { DateTime: { input: 'string', output: 'string' } } },
    },
  },
};
export default config;
