import type { ESLint, Linter } from 'eslint';

import { layerImports } from './rules/layer-imports';
import { noCrossPage } from './rules/no-cross-page';
import { slicePublicApi } from './rules/slice-public-api';

const plugin = {
  meta: { name: '@side/fsd-boundaries', version: '0.0.0' },
  rules: {
    'layer-imports': layerImports,
    'slice-public-api': slicePublicApi,
    'no-cross-page': noCrossPage,
  },
} as unknown as ESLint.Plugin;

export function fsdBoundaries(srcDir: string): Linter.Config[] {
  return [
    {
      name: 'side/fsd-boundaries',
      files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'],
      plugins: { fsd: plugin },
      rules: {
        'fsd/layer-imports': ['error', { srcDir }],
        'fsd/slice-public-api': ['error', { srcDir }],
        'fsd/no-cross-page': ['error', { srcDir }],
      },
    },
  ];
}
