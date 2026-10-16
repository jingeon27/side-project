import { coreConfig } from '@side/eslint-config';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/generated.ts',
    '**/generated/**',
    '**/next-env.d.ts',
    '**/.data/**',
    '**/playwright-report/**',
    '**/test-results/**',
    '**/.e2e-build/**',
    // 웹·모바일은 각 앱의 eslint.config.ts가 검사한다.
    'apps/web/**',
    'apps/mobile/**',
  ]),
  ...tseslint.configs.recommended,
  coreConfig,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
]);
