// @vitest-environment node
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: fileURLToPath(new URL('.', import.meta.url)) });

async function boundaryErrors(filePath: string, source: string) {
  const [result] = await eslint.lintText(`${source}\nexport const value = imported;\n`, { filePath });
  return result!.messages.filter((message) => message.ruleId === 'no-restricted-imports').length;
}

describe('FSD layer boundaries', () => {
  it.each([
    ['src/shared/lib/sample.ts', "import { imported } from '@/features/article-search/lib/x';"],
    ['src/shared/lib/sample.ts', "import { imported } from '../../features/article-search/lib/x';"],
    ['src/shared/ui/mdx/sample.tsx', "import { imported } from '../../../entities/article/lib/x';"],
    ['src/entities/article/ui/sample.tsx', "import { imported } from '../../../widgets/footer/ui/x';"],
    ['src/features/article-search/ui/sample.tsx', "import { imported } from '../../../app/sitemap';"],
    ['src/widgets/footer/ui/sample.tsx', "import { imported } from '../../../app';"],
  ])('blocks %s from importing a higher layer: %s', async (filePath, source) => {
    expect(await boundaryErrors(filePath, source)).toBe(1);
  });

  it.each([
    [
      'src/features/article-search/ui/sample.tsx',
      "import { imported } from '../../../entities/article/lib/x';",
    ],
    ['src/entities/article/ui/sample.tsx', "import { imported } from '../lib/get-articles';"],
    ['src/widgets/footer/ui/sample.tsx', "import { imported } from '@/shared/config/labels';"],
  ])('allows %s to import the same or a lower layer: %s', async (filePath, source) => {
    expect(await boundaryErrors(filePath, source)).toBe(0);
  });
});
