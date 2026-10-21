import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parser } from 'typescript-eslint';

export const languageOptions = {
  parser,
  ecmaVersion: 'latest',
  sourceType: 'module',
  parserOptions: { ecmaFeatures: { jsx: true } },
} as const;

export function fixtureRoot(...parts: string[]) {
  return path.resolve(import.meta.dirname, '../rules/__fixtures__', ...parts);
}

export function readFixture(file: string) {
  const filename = fixtureRoot(file);
  return { filename, code: readFileSync(filename, 'utf8') };
}
