// @vitest-environment node
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: fileURLToPath(new URL('.', import.meta.url)) });

async function boundaryErrors(filePath: string, source: string) {
  const [result] = await eslint.lintText(`${source}\nexport const value = imported;\n`, { filePath });
  return result!.messages.filter((message) => message.ruleId === 'no-restricted-imports').length;
}

describe('FSD layer boundaries', () => {
  beforeAll(async () => {
    await eslint.calculateConfigForFile('src/app/sitemap.ts');
  }, 30_000);

  it('rejects else branches and accepts an early return', async () => {
    const source = 'export function choose(value: boolean) { if (value) return 1; else return 0; }';
    const [invalid] = await eslint.lintText(source, { filePath: 'src/shared/lib/sample.ts' });
    expect(invalid!.messages.some((message) => message.ruleId === 'no-restricted-syntax')).toBe(true);
    const [valid] = await eslint.lintText(
      'export function choose(value: boolean) { if (value) return 1; return 0; }',
      { filePath: 'src/shared/lib/sample.ts' },
    );
    expect(valid!.messages.some((message) => message.ruleId === 'no-restricted-syntax')).toBe(false);
  });

  it.each([
    ['src/shared/lib/sample.ts', "import { imported } from '@/features/article-search/lib/x';"],
    ['src/shared/lib/sample.ts', "import { imported } from '../../features/article-search/lib/x';"],
    ['src/shared/ui/mdx/sample.tsx', "import { imported } from '../../../features/article/ui/x';"],
    ['src/features/article/ui/sample.tsx', "import { imported } from '../../../widgets/footer/ui/x';"],
    ['src/features/article-search/ui/sample.tsx', "import { imported } from '../../../app/sitemap';"],
    ['src/widgets/footer/ui/sample.tsx', "import { imported } from '../../../app';"],
  ])('blocks %s from importing a higher layer: %s', async (filePath, source) => {
    expect(await boundaryErrors(filePath, source)).toBe(1);
  });

  it.each([
    [
      'src/features/article-search/ui/sample.tsx',
      "import { imported } from '../../../shared/article/lib/x';",
    ],
    ['src/features/article/ui/sample.tsx', "import { imported } from '@/shared/article/lib/get-articles';"],
    ['src/widgets/footer/ui/sample.tsx', "import { imported } from '@/shared/config/labels';"],
  ])('allows %s to import the same or a lower layer: %s', async (filePath, source) => {
    expect(await boundaryErrors(filePath, source)).toBe(0);
  });
});
