import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { analyzeMdx, metaSchema, readContent, seoSchema } from './content';

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
  await mkdir(path.join(root, 'public/images'), { recursive: true });
  await mkdir(path.join(root, 'seo'));
  const write = async (file: string, value: unknown) =>
    writeFile(path.join(root, file), JSON.stringify(value));
  const seo = (posts: object) => ({
    site: { ...base, keywords: [] },
    pages: { home: base, blog: base, about: base, privacy: base, tag: { description: 'Posts with {tag}' } },
    posts,
  });
  await writeFile(path.join(root, 'public/images/cache.png'), 'png');
  await write('content/posts/cache/meta.json', {
    category: 'engineering',
    tags: ['nextjs'],
    publishedAt: '2026-10-01',
    coverImage: '/images/cache.png',
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
  it.each([
    '[Read][Article]\n\n[article]: /en/blog/missing',
    '[Article][]\n\n[article]: /en/blog/missing',
    '[Article]\n\n[article]: /en/blog/missing',
  ])('checks article destinations in reference-style Markdown: %s', async (source) => {
    const { root } = await fixture();
    await writeFile(path.join(root, 'content/posts/cache/en.mdx'), source);
    await expect(readContent(root)).rejects.toThrow('broken article link /en/blog/missing');
  });
  it.each([
    ['![Preview][Image]\n\n[image]: /images/missing.png', 'ENOENT'],
    ['![Image][]\n\n[image]: /images/missing.png', 'ENOENT'],
    ['![Image]\n\n[image]: /images/missing.png', 'ENOENT'],
    ['![Preview][image]\n\n[image]: http://example.com/image.png', 'unresolved image'],
  ])('checks reference-style image destinations: %s', async (source, message) => {
    const { root } = await fixture();
    await writeFile(path.join(root, 'content/posts/cache/en.mdx'), source);
    await expect(readContent(root)).rejects.toThrow(message);
  });
  it('resolves reference labels with Markdown case and first-definition rules without validating unused definitions', async () => {
    const { root } = await fixture();
    await mkdir(path.join(root, 'public/images'), { recursive: true });
    await writeFile(path.join(root, 'public/images/cache.png'), 'png');
    const file = path.join(root, 'content/posts/cache/en.mdx');
    await writeFile(
      file,
      '[Read][ARTICLE]\n\n![Preview][Image]\n\n[article]: /en/blog/cache-design?ref=note#cache\n[ARTICLE]: /en/blog/missing\n[image]: /images/cache.png\n[unused]: /images/missing.png',
    );
    await expect(readContent(root)).resolves.toBeTruthy();
    await writeFile(file, '[Read][article]\n\n[Article]: /en/blog/missing\n[article]: /en/blog/cache-design');
    await expect(readContent(root)).rejects.toThrow('broken article link /en/blog/missing');
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
it('estimates reading time from prose without code blocks or image alt text', () => {
  // 500 Korean characters are one minute of reading.
  const prose = '가'.repeat(500);
  const codeBlock = `\`\`\`ts\n${'const value = 1;\n'.repeat(400)}\`\`\``;
  const image = `![${'긴 설명'.repeat(500)}](/images/cache.png)`;
  expect(analyzeMdx(`${prose}\n\n${codeBlock}\n\n${image}`).readingMinutes).toBe(1);
  // Inline code is read as part of its sentence, so 220 words of it add a minute.
  expect(analyzeMdx(`${prose} \`${'word '.repeat(220).trim()}\``).readingMinutes).toBe(2);
});
it('validates category IDs, normalized unique tags, and date chronology', () => {
  const meta = {
    category: 'engineering',
    tags: ['nextjs'],
    publishedAt: '2026-10-01T10:00:00+09:00',
    coverImage: '/images/cache.png',
  };
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
  const base = { category: 'engineering', tags: ['nextjs'], coverImage: '/images/cache.png' };
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
it('requires a cover and a JPG or PNG image for share previews', () => {
  const meta = { category: 'engineering', tags: ['nextjs'], publishedAt: '2026-10-01' };
  const accepts = (images: object) => metaSchema.safeParse({ ...meta, ...images }).success;
  expect(
    accepts({ coverImage: '/images/covers/cache.avif', socialImage: '/images/covers/cache-og.jpg' }),
  ).toBe(true);
  expect(accepts({ coverImage: '/images/covers/cache.png' })).toBe(true);
  // og:image falls back to the cover, and X cards do not show AVIF.
  expect(accepts({ coverImage: '/images/covers/cache.avif' })).toBe(false);
  expect(accepts({ coverImage: '/images/covers/cache.avif', socialImage: '/images/covers/cache.avif' })).toBe(
    false,
  );
  expect(accepts({ socialImage: '/images/covers/cache-og.jpg' })).toBe(false);
});
it('requires the tag page description to name its tag', () => {
  const pages = { home: base, blog: base, about: base, privacy: base };
  const accepts = (description: string) =>
    seoSchema.safeParse({
      site: { ...base, keywords: [] },
      pages: { ...pages, tag: { description } },
      posts: {},
    }).success;
  expect(accepts('Posts with the {tag} tag.')).toBe(true);
  // Without the placeholder every indexed tag page would share one description.
  expect(accepts('Posts with this tag.')).toBe(false);
});
