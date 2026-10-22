import { defineConfig } from 'orval';

export default defineConfig({
  client: {
    input: '../../apps/api/openapi.json',
    output: {
      target: './src/generated/client.ts',
      schemas: { path: './src/generated/models', type: 'zod' },
      client: 'fetch',
      clean: true,
      // 경로 파라미터를 encodeURIComponent로 감싼다. 남은 점 세그먼트와 구분자는 apiFetch가 거부한다.
      urlEncodeParameters: true,
      override: {
        fetch: { includeHttpResponseReturnType: false, forceSuccessResponse: true, runtimeValidation: true },
        includeZodSchemaInArguments: true,
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
