import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

const layers = ['shared', 'entities', 'features', 'widgets', 'app'];
const boundaries = layers.slice(0, -1).map((layer, index) => ({
  files: [`src/${layer}/**/*.{ts,tsx}`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: layers.slice(index + 1).map((upper) => `@/${upper}/**`),
            message: 'FSD layers may only depend on lower layers.',
          },
        ],
      },
    ],
  },
}));
export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  ...boundaries,
  globalIgnores([
    '.next/**',
    'playwright-report/**',
    'test-results/**',
    'coverage/**',
    'src/entities/article/lib/registry.ts',
  ]),
]);
