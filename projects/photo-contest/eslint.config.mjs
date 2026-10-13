import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
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
  ]),
  ...nextVitals.map((c) => ({ ...c, files: ['apps/web/**/*.{ts,tsx}'] })),
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/src/features/auth/login.tsx', 'apps/web/src/_app/shell.tsx'],
    rules: { '@next/next/no-location-assign-relative-destination': 'off' },
  },
  {
    settings: { next: { rootDir: 'apps/web' } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
]);
