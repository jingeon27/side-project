import type { Linter } from 'eslint';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

import { commonRulesConfig } from '@side/config/eslint/base';
import { handlerNamesConfig, hooksDependencyConfig } from '@side/config/eslint/react';

const layers = ['shared', 'features', 'widgets', 'app'];
const boundaries = layers.slice(0, -1).map((layer, index): Linter.Config => {
  const uppers = layers.slice(index + 1);
  const message = 'FSD layers may only depend on lower layers.';
  return {
    files: [`src/${layer}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: uppers.map((upper) => `@/${upper}/**`), message },
            // Relative paths that climb out of the slice into a higher layer (`../../features/...`).
            { regex: `^(?:\\./)?(?:\\.\\./)+(?:src/)?(?:${uppers.join('|')})(?:/|$)`, message },
          ],
        },
      ],
    },
  };
});
export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  handlerNamesConfig,
  hooksDependencyConfig,
  ...boundaries,
  // eslint-config-next가 typescript-eslint를 등록하므로 baseConfig 대신 공통 side 규칙만 더한다.
  ...commonRulesConfig,
  globalIgnores([
    '.next/**',
    'playwright-report/**',
    'test-results/**',
    'coverage/**',
    'src/shared/article/lib/registry.ts',
  ]),
]);
