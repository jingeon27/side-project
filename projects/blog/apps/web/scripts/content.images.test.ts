import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { imageSize } from 'image-size';
import { visit } from 'unist-util-visit';
import { describe, expect, it } from 'vitest';

import { getArticles } from '@/shared/article/lib/get-articles';

import screenCaptures from '../../../docs/screen-captures.json';
import { analyzeMdx } from './content';

const root = process.cwd();

describe('article images', () => {
  it('keeps the originals of recorded image replacements and validates the replacements', async () => {
    const replacements = JSON.parse(
      await readFile(path.join(root, 'content/image-replacements.json'), 'utf8'),
    ) as Record<string, string>;
    for (const [original, replacement] of Object.entries(replacements)) {
      const archived = await readFile(path.join(root, 'public', original));
      expect(archived.length, original).toBeGreaterThan(0);
      const replacementSize = imageSize(await readFile(path.join(root, 'public', replacement)));
      expect(replacementSize.type).toBe('avif');
      const capture = screenCaptures.captures.find((entry) => entry.original === original);
      if (capture) {
        expect(replacement).toBe(capture.replacement.replace(/\.png$/, '.avif'));
        expect(createHash('sha256').update(archived).digest('hex')).toBe(capture.originalSha256);
        const refreshed = await readFile(path.join(root, 'public', capture.replacement));
        expect(createHash('sha256').update(refreshed).digest('hex')).toBe(capture.replacementSha256);
        expect(imageSize(refreshed)).toMatchObject({ width: capture.width, height: capture.height });
        expect(replacementSize).toMatchObject({ width: capture.width, height: capture.height });
        for (const screen of capture.screens) {
          const source = await readFile(path.join(root, 'public', screen.sourceImage));
          expect(createHash('sha256').update(source).digest('hex')).toBe(screen.sourceSha256);
          expect(imageSize(source)).toMatchObject({ width: screen.sourceWidth, height: screen.sourceHeight });
        }
        continue;
      }
      expect(replacement).toMatch(/^\/images\/covers\/[a-z0-9-]+\.avif$/);
      expect(replacementSize.width).toBeGreaterThan(0);
      expect(replacementSize.height).toBeGreaterThan(0);
    }
  });

  it('shows the cover image in the article body and keeps image alt text readable', async () => {
    for (const article of getArticles('ko')) {
      const source = await readFile(path.join(root, 'content/posts', article.id, 'ko.mdx'), 'utf8');
      const { tree } = analyzeMdx(source);
      const images: { url: string; alt?: string | null }[] = [];
      visit(tree, 'image', (node) => {
        images.push(node);
      });
      if (article.coverImage)
        expect(
          images.map((image) => image.url),
          article.id,
        ).toContain(article.coverImage);
      for (const image of images) {
        // Regression: data-alt="조회&middot;화면" became literal "&middot;"
        // after Markdown decoded the importer-generated "&amp;middot;".
        expect(image.alt, image.url).not.toMatch(/&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]+);/i);
        expect(image.alt?.trim(), image.url).toBeTruthy();
      }
    }
  });
});
