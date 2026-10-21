import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getArticleThumbnail } from '@/entities/article/lib/article-thumbnails';
import articles from '@/entities/article/lib/index.json';

const publicRoot = path.resolve(process.cwd(), 'public');

async function expectLocalImage(src: string) {
  expect(src).toMatch(/^\/images\//);
  expect(src).not.toMatch(/[\\?#\u0000-\u001f]/);
  const decoded = decodeURIComponent(src);
  expect(decoded.split('/')).not.toContain('..');
  const file = await realpath(path.resolve(publicRoot, `.${decoded}`));
  const relative = path.relative(await realpath(publicRoot), file);
  expect(relative).not.toMatch(/^\.\.(?:[/\\]|$)/);
  expect(path.isAbsolute(relative)).toBe(false);

  const bytes = await readFile(file);
  expect(bytes.length).toBeGreaterThan(32);
  const extension = path.extname(file).toLowerCase();
  if (extension === '.png') {
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(bytes.readUInt32BE(16)).toBeGreaterThan(0);
    expect(bytes.readUInt32BE(20)).toBeGreaterThan(0);
  } else if (extension === '.jpg' || extension === '.jpeg') {
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([255, 216, 255]));
    expect(bytes.subarray(-2)).toEqual(Buffer.from([255, 217]));
  } else if (extension === '.svg') {
    const document = new DOMParser().parseFromString(bytes.toString('utf8'), 'image/svg+xml');
    expect(document.querySelector('parsererror')).toBeNull();
    expect(document.documentElement.localName).toBe('svg');
    expect(document.documentElement.namespaceURI).toBe('http://www.w3.org/2000/svg');
    const viewBox = document.documentElement
      .getAttribute('viewBox')
      ?.trim()
      .split(/[\s,]+/)
      .map(Number);
    expect(viewBox).toHaveLength(4);
    expect(viewBox?.every(Number.isFinite)).toBe(true);
    expect(viewBox?.[2]).toBeGreaterThan(0);
    expect(viewBox?.[3]).toBeGreaterThan(0);
    expect(document.querySelector('script, foreignObject')).toBeNull();
  } else {
    throw new Error(`Unsupported thumbnail format: ${src}`);
  }
}

describe('published article thumbnail assets', () => {
  it('resolves every published article to a safe, existing image with valid image data', async () => {
    expect(articles.length).toBeGreaterThan(0);
    for (const article of articles) {
      const thumbnail = getArticleThumbnail(article);
      expect(['cover', 'contain'], article.id).toContain(thumbnail.fit);
      await expectLocalImage(thumbnail.src);
    }
  });

  it('uses an explicit cover image ahead of any article-specific artwork', () => {
    const covered = articles.find((article) => article.coverImage);
    const other = articles.find((article) => !article.coverImage);
    expect(covered?.coverImage).toBeTruthy();
    expect(other).toBeDefined();
    expect(getArticleThumbnail({ id: other!.id, coverImage: covered!.coverImage! })).toEqual({
      src: covered!.coverImage!,
      fit: 'cover',
    });
  });

  it.each(['a-future-unmapped-article', 'constructor', '__proto__'])(
    'keeps a usable local fallback for a future article without a mapped image: %s',
    async (id) => {
      const thumbnail = getArticleThumbnail({ id });
      expect(['cover', 'contain']).toContain(thumbnail.fit);
      await expectLocalImage(thumbnail.src);
    },
  );
});
