import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { analyzeMdx, metaSchema, readContent } from './content';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
const base = { title: 'Blog', description: 'Engineering notes' };
const post = (slug: string) => ({ ...base, slug, keywords: ['engineering'] });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'blog-content-'));
  directories.push(root);
  await mkdir(path.join(root, 'content/posts/cache'), { recursive: true });
  await mkdir(path.join(root, 'seo'));
  const write = async (file: string, value: unknown) =>
    writeFile(path.join(root, file), JSON.stringify(value));
  const seo = (posts: object) => ({
    site: { ...base, keywords: [] },
    pages: { home: base, blog: base, about: base, privacy: base },
    posts,
  });
  await write('content/posts/cache/meta.json', {
    category: 'engineering',
    tags: ['nextjs'],
    publishedAt: '2026-10-01',
  });
  await write('seo/ko.json', seo({ cache: post('캐시-설계') }));
  await write('seo/en.json', seo({ cache: post('cache-design') }));
  await writeFile(path.join(root, 'content/posts/cache/ko.mdx'), '## 캐시 설계\n\n한국어 본문');
  await writeFile(path.join(root, 'content/posts/cache/en.mdx'), '## Cache design\n\nEnglish text');
  return { root, write, seo };
}

describe('content registry contract', () => {
  it('maps real translations through a stable content ID and preserves different slugs', async () => {
    const { root } = await fixture();
    const result = await readContent(root);
    expect(result.articles).toHaveLength(2);
    expect(
      result.articles.every(
        (article) => article.translations.ko === '캐시-설계' && article.translations.en === 'cache-design',
      ),
    ).toBe(true);
    expect(result.imports).toEqual([
      { id: 'cache', locale: 'ko' },
      { id: 'cache', locale: 'en' },
    ]);
  });
  it('refuses an SEO entry for a translation without MDX', async () => {
    const { root } = await fixture();
    await rm(path.join(root, 'content/posts/cache/en.mdx'));
    await expect(readContent(root)).rejects.toThrow('MDX and SEO must both exist');
  });
  it('allows an untranslated Korean article without inventing an English version', async () => {
    const { root, write, seo } = await fixture();
    await rm(path.join(root, 'content/posts/cache/en.mdx'));
    await write('seo/en.json', seo({}));
    const { articles } = await readContent(root);
    expect(articles).toHaveLength(1);
    expect(articles[0]?.translations).toEqual({ ko: '캐시-설계' });
  });
  it('rejects SEO pointing to a nonexistent content ID', async () => {
    const { root, write, seo } = await fixture();
    await write('seo/ko.json', seo({ missing: post('missing') }));
    await expect(readContent(root)).rejects.toThrow('missing content missing');
  });
  it('rejects duplicate slugs before content can be published', async () => {
    const { root, write, seo } = await fixture();
    await mkdir(path.join(root, 'content/posts/other'));
    await write('seo/ko.json', seo({ cache: post('duplicate'), other: post('duplicate') }));
    await expect(readContent(root)).rejects.toThrow('duplicate slug');
  });
  it('allows only registered MDX components with literal or numeric props and checks their src', async () => {
    const { root } = await fixture();
    const file = path.join(root, 'content/posts/cache/en.mdx');
    await mkdir(path.join(root, 'public/images'), { recursive: true });
    await writeFile(path.join(root, 'public/images/cache.png'), 'png');
    await writeFile(
      file,
      '<Figure src="/images/cache.png" alt="Cache" width={640} caption="Flow" />\n\n<Callout title="Note">Text</Callout>',
    );
    await expect(readContent(root)).resolves.toBeTruthy();

    for (const [source, message] of [
      ["import Chart from './chart'\n\nText", 'import/export is not allowed'],
      ['export const meta = {}\n\nText', 'import/export is not allowed'],
      ['Total: {1 + 1}', 'JavaScript expressions are not allowed'],
      ['<Chart />', 'unsupported JSX <Chart>'],
      ['<div>raw</div>', 'unsupported JSX <div>'],
      ['<Callout {...props}>Text</Callout>', 'spread props are not allowed'],
      ['<Callout title={fetch("/x")}>Text</Callout>', 'only numeric expression props'],
      ['<Figure src="/images/missing.png" />', 'ENOENT'],
      ['<Figure src="http://example.com/a.png" />', 'unresolved image'],
    ]) {
      await writeFile(file, source!);
      await expect(readContent(root), source).rejects.toThrow(message);
    }
  });
  it.each([
    '**[근접성](https://example.com)**은 원리예요.',
    '**멘탈 모델(mental model)**은 생각이에요.',
    '**`code`**는 값이에요.',
  ])('closes bold before a Korean particle after punctuation: %s', (source) => {
    const { tree } = analyzeMdx(source);
    expect(tree.children[0]).toMatchObject({ children: [{ type: 'strong' }, { type: 'text' }] });
  });
  it('keeps Korean ranges as text and strikes through only double tildes', () => {
    const range = '기간은 3~5일과 7~9일이에요.';
    expect(analyzeMdx(range).tree.children[0]).toMatchObject({
      children: [{ type: 'text', value: range }],
    });
    expect(analyzeMdx('~~취소~~는 값이에요.').tree.children[0]).toMatchObject({
      children: [{ type: 'delete' }, { type: 'text' }],
    });
  });
  it('refuses malformed MDX and unresolved internal article links', async () => {
    const { root } = await fixture();
    const file = path.join(root, 'content/posts/cache/en.mdx');
    await writeFile(file, '<Callout>broken');
    await expect(readContent(root)).rejects.toThrow();
    await writeFile(file, '[Missing](/en/blog/nonexistent)');
    await expect(readContent(root)).rejects.toThrow('broken article link');
  });
});

it('uses the same heading text and duplicate suffixes as github-slugger', () => {
  const { toc } = analyzeMdx(
    '# Title\n\n## **같은** 제목\n\n### `code` title\n\n## 같은 제목\n\n```ts\n## not a heading\n```',
  );
  expect(toc).toEqual([
    { id: '같은-제목', title: '같은 제목', level: 2 },
    { id: 'code-title', title: 'code title', level: 3 },
    { id: '같은-제목-1', title: '같은 제목', level: 2 },
  ]);
});
it('validates category IDs, normalized unique tags, and date chronology', () => {
  const meta = { category: 'engineering', tags: ['nextjs'], publishedAt: '2026-10-01T10:00:00+09:00' };
  expect(metaSchema.safeParse(meta).success).toBe(true);
  for (const invalid of [
    { ...meta, category: 'projects' },
    { ...meta, tags: ['nextjs', 'nextjs'] },
    { ...meta, tags: ['React Query'] },
    { ...meta, tags: ['리펙토링'] },
    { ...meta, updatedAt: '2026-09-01' },
    { ...meta, publishedAt: 'yesterday' },
  ])
    expect(metaSchema.safeParse(invalid).success).toBe(false);
});
it('compares date-only and offset datetimes on the Asia/Seoul calendar', () => {
  const base = { category: 'engineering', tags: ['nextjs'] };
  // A same-day edit in KST is 23:00 UTC of the previous day; UTC midnight parsing rejected it.
  expect(
    metaSchema.safeParse({ ...base, publishedAt: '2026-10-01', updatedAt: '2026-10-01T08:00:00+09:00' })
      .success,
  ).toBe(true);
  expect(
    metaSchema.safeParse({ ...base, publishedAt: '2026-10-01T10:00:00+09:00', updatedAt: '2026-10-01' })
      .success,
  ).toBe(false);
});
