import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { visit } from 'unist-util-visit';
import { analyzeMdx } from '../../scripts/content';

const root = process.cwd();
type MigratedPost = {
  sourceUrl: string;
  contentId: string;
  codeSha256: string[];
  images: { path: string; sha256: string }[];
};

describe('published Tistory migration artifacts', () => {
  it('preserves every published code example exactly when other files are formatted', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(root, '../../docs/migration-manifest.json'), 'utf8'),
    ) as { posts: MigratedPost[] };
    for (const post of manifest.posts) {
      const source = await readFile(path.join(root, 'content/posts', post.contentId, 'ko.mdx'), 'utf8');
      const { tree } = analyzeMdx(source);
      const hashes: string[] = [];
      visit(tree, 'code', (node) => {
        hashes.push(createHash('sha256').update(node.value).digest('hex'));
      });
      expect(hashes, post.sourceUrl).toEqual(post.codeSha256);
    }
  });

  it('keeps public image bytes and readable alt text through HTML entity conversion', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(root, '../../docs/migration-manifest.json'), 'utf8'),
    ) as { posts: MigratedPost[] };
    for (const post of manifest.posts) {
      const source = await readFile(path.join(root, 'content/posts', post.contentId, 'ko.mdx'), 'utf8');
      const { tree } = analyzeMdx(source);
      const images: { url: string; alt?: string | null }[] = [];
      visit(tree, 'image', (node) => {
        images.push(node);
      });
      expect(
        images.map((image) => image.url),
        post.sourceUrl,
      ).toEqual(post.images.map((image) => image.path));
      for (const image of images) {
        // Regression: data-alt="조회&middot;화면" became literal "&middot;"
        // after Markdown decoded the importer-generated "&amp;middot;".
        expect(image.alt, image.url).not.toMatch(/&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]+);/i);
        expect(image.alt?.trim(), image.url).toBeTruthy();
      }
      for (const image of post.images) {
        const bytes = await readFile(path.join(root, 'public', image.path));
        expect(createHash('sha256').update(bytes).digest('hex'), image.path).toBe(image.sha256);
      }
    }
  });
});
