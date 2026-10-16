import { defineConfig } from 'orval';

export default defineConfig({
  client: {
    input: '../../apps/api/openapi.json',
    output: {
      target: './src/generated/client.ts',
      schemas: './src/generated/models',
      client: 'fetch',
      clean: true,
      override: {
        fetch: { includeHttpResponseReturnType: false, forceSuccessResponse: true },
        mutator: { path: './src/http.ts', name: 'apiFetch' },
      },
    },
  },
  validation: {
    input: '../../apps/api/openapi.json',
    output: {
      target: './src/generated/validation.ts',
      client: 'zod',
      override: { zod: { generate: { response: true, body: true, query: true, param: true } } },
    },
  },
});
