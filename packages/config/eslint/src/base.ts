import type { Linter } from 'eslint';
import tseslint from 'typescript-eslint';

import { sidePlugin } from './plugin';

export const buildArtifactIgnores = [
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
  '**/coverage/**',
];

export const testFiles = [
  '**/*.spec.{ts,tsx}',
  '**/*.test.{ts,tsx}',
  '**/e2e/**',
  '**/src/test/**',
  '**/vitest.*.{ts,mts}',
];

export const baseConfig: Linter.Config[] = [
  { ignores: buildArtifactIgnores },
  ...tseslint.configs.recommended,
  {
    name: 'side/base',
    plugins: { side: sidePlugin },
    // common 규칙만 켠다. web 규칙은 reactConfig·nextConfig가 켠다.
    rules: {
      'side/no-else': 'error',
      'side/no-wildcard-exports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];

// 에디터 ESLint 서버는 여러 설정을 한 프로세스에서 읽어 typescript-eslint가 tsconfigRootDir을 추론하지 못한다.
export function tsconfigRootDir(dir: string): Linter.Config {
  return { name: 'side/tsconfig-root-dir', languageOptions: { parserOptions: { tsconfigRootDir: dir } } };
}

export const testOverrides: Linter.Config[] = [
  { files: testFiles, rules: { '@typescript-eslint/no-non-null-assertion': 'off' } },
];
