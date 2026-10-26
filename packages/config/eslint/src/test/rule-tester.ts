import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parser } from 'typescript-eslint';

export const languageOptions = {
  parser,
  ecmaVersion: 'latest',
  sourceType: 'module',
  parserOptions: { ecmaFeatures: { jsx: true } },
} as const;

// spec과 같은 폴더의 __fixtures__를 읽는다. spec에서 import.meta.dirname을 넘긴다.
export function createFixtures(specDir: string) {
  const root = path.join(specDir, '__fixtures__');
  return {
    root,
    read(file: string) {
      const filename = path.join(root, file);
      return { filename, code: readFileSync(filename, 'utf8') };
    },
  };
}
