import { noElse } from './rules/no-else.mjs';
import { noComponentFetch } from './rules/no-component-fetch.mjs';

export const sidePlugin = {
  meta: { name: '@side/eslint-config', version: '0.0.0' },
  rules: { 'no-else': noElse, 'no-component-fetch': noComponentFetch },
};
export const coreConfig = { plugins: { side: sidePlugin }, rules: { 'side/no-else': 'error' } };
