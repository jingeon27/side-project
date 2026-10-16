import type { ESLint, Linter } from 'eslint';

import { noElse } from './rules/no-else';
import { noComponentFetch } from './rules/no-component-fetch';

export const sidePlugin = {
  meta: { name: '@side/eslint-config', version: '0.0.0' },
  rules: { 'no-else': noElse, 'no-component-fetch': noComponentFetch },
} satisfies ESLint.Plugin;
export const coreConfig = {
  plugins: { side: sidePlugin },
  rules: { 'side/no-else': 'error' },
} satisfies Linter.Config;
