import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { visit } from 'unist-util-visit';
import { describe, expect, it } from 'vitest';

import { analyzeMdx } from './content';

const root = process.cwd();
type MigratedPost = {
  sourceUrl: string;
  contentId: string;
  codeSha256: string[];
  images: { path: string; sha256: string }[];
};

describe('published Tistory migration artifacts', () => {
  it('preserves published code apart from explicitly recorded comment punctuation edits', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(root, '../../docs/migration-manifest.json'), 'utf8'),
    ) as { posts: MigratedPost[] };
    const commentEdits = JSON.parse(
      await readFile(path.join(root, 'content/code-comment-edits.json'), 'utf8'),
    ) as Record<string, { before: string; after: string }[]>;
    for (const contentId of Object.keys(commentEdits)) {
      expect(
        manifest.posts.some((post) => post.contentId === contentId),
        contentId,
      ).toBe(true);
    }
    for (const post of manifest.posts) {
      const source = await readFile(path.join(root, 'content/posts', post.contentId, 'ko.mdx'), 'utf8');
      const { tree } = analyzeMdx(source);
      const edits = commentEdits[post.contentId] ?? [];
      const blocks: string[] = [];
      visit(tree, 'code', (node) => {
        blocks.push(node.value);
      });
      for (const { before, after } of edits) {
        expect(before).toMatch(/^(?:\/\/|#) /);
        expect(after).not.toBe(before);
        expect(after).toBe(before.replaceAll(' — ', ': '));
        expect(
          blocks.some((block) => block.includes(after)),
          post.contentId,
        ).toBe(true);
      }
      const hashes: string[] = [];
      for (const block of blocks) {
        const original = edits.reduce((value, { before, after }) => value.replaceAll(after, before), block);
        hashes.push(createHash('sha256').update(original).digest('hex'));
      }
      expect(hashes, post.sourceUrl).toEqual(post.codeSha256);
    }
  });

  it('preserves archived image bytes and only uses explicitly recorded editorial replacements', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(root, '../../docs/migration-manifest.json'), 'utf8'),
    ) as { posts: MigratedPost[] };
    const replacements = JSON.parse(
      await readFile(path.join(root, 'content/image-replacements.json'), 'utf8'),
    ) as Record<string, string>;
    const originalPaths = new Set(manifest.posts.flatMap((post) => post.images.map((image) => image.path)));
    for (const [original, replacement] of Object.entries(replacements)) {
      expect(originalPaths.has(original), original).toBe(true);
      expect(replacement).toMatch(/^\/images\/covers\/[a-z0-9-]+\.png$/);
      const bytes = await readFile(path.join(root, 'public', replacement));
      expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(bytes.readUInt32BE(16)).toBeGreaterThan(0);
      expect(bytes.readUInt32BE(20)).toBeGreaterThan(0);
    }
    for (const post of manifest.posts) {
      const source = await readFile(path.join(root, 'content/posts', post.contentId, 'ko.mdx'), 'utf8');
      const { tree } = analyzeMdx(source);
      const images: { url: string; alt?: string | null }[] = [];
      visit(tree, 'image', (node) => {
        images.push(node);
      });
      const meta = JSON.parse(
        await readFile(path.join(root, 'content/posts', post.contentId, 'meta.json'), 'utf8'),
      ) as { coverImage?: string };
      const archivedImages = post.images.map((image) =>
        Object.hasOwn(replacements, image.path) ? replacements[image.path] : image.path,
      );
      const expectedImages =
        meta.coverImage && !archivedImages.includes(meta.coverImage)
          ? [meta.coverImage, ...archivedImages]
          : archivedImages;
      expect(
        images.map((image) => image.url),
        post.sourceUrl,
      ).toEqual(expectedImages);
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
