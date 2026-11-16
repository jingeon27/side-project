import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import { imageSize } from 'image-size';
import { describe, expect, it } from 'vitest';

import { defaultArticleThumbnail, getArticleThumbnail } from '@/shared/article/lib/article-thumbnails';
import articles from '@/shared/article/lib/index.json';

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
    return;
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([255, 216, 255]));
    expect(bytes.subarray(-2)).toEqual(Buffer.from([255, 217]));
    return;
  }
  if (extension === '.avif') {
    const size = imageSize(bytes);
    expect(size.type).toBe('avif');
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
    return;
  }
  if (extension === '.svg') {
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
    return;
  }
  throw new Error(`Unsupported thumbnail format: ${src}`);
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

  it('shows each article its own cover image', () => {
    for (const article of articles)
      expect(getArticleThumbnail(article), article.id).toEqual({ src: article.coverImage, fit: 'cover' });
  });

  it('keeps a usable neutral fallback for an article without a cover image', async () => {
    const thumbnail = getArticleThumbnail({});
    // Another article's diagram would describe the wrong post, so the fallback is neutral artwork.
    expect(thumbnail).toEqual(defaultArticleThumbnail);
    await expectLocalImage(thumbnail.src);
  });
});
