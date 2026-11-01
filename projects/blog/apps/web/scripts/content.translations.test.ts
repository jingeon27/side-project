import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { visit } from 'unist-util-visit';
import { describe, expect, it } from 'vitest';

import { getArticles } from '@/shared/article/lib/get-articles';

import manifest from '../../../docs/migration-manifest.json';
import localizations from '../content/english-localizations.json';
import imageReplacements from '../content/image-replacements.json';
import { analyzeMdx } from './content';

const ids = manifest.posts.map((post) => post.contentId);
const root = path.join(process.cwd(), 'content/posts');
type Root = ReturnType<typeof analyzeMdx>['tree'];

async function pair(id: string) {
  const sources = await Promise.all(
    ['ko', 'en'].map((locale) => readFile(path.join(root, id, `${locale}.mdx`), 'utf8')),
  );
  return sources.map((source) => analyzeMdx(source).tree) as [Root, Root];
}

describe('English editions of migrated posts', () => {
  it('registers both editions with their own title, description, slug, and reciprocal translation map', () => {
    const korean = getArticles('ko');
    const english = getArticles('en');
    for (const id of ids) {
      const ko = korean.find((article) => article.id === id)!;
      const en = english.find((article) => article.id === id)!;
      expect(ko, id).toBeDefined();
      expect(en, id).toBeDefined();
      expect(en.title).not.toMatch(/[가-힣]/);
      expect(en.description).not.toMatch(/[가-힣]/);
      expect(en.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(en.translations).toEqual({ ko: ko.slug, en: en.slug });
      expect(ko.translations).toEqual(en.translations);
      expect(en.publishedAt).toBe(ko.publishedAt);
    }
  });

  it('preserves code and structure apart from explicitly recorded English localizations', async () => {
    function artifacts(tree: Root) {
      const code: string[] = [];
      const images: string[] = [];
      const headings: number[] = [];
      const tables: number[][] = [];
      visit(tree, 'code', (node) => {
        code.push(createHash('sha256').update(node.value).digest('hex'));
      });
      visit(tree, 'image', (node) => {
        images.push(node.url);
      });
      visit(tree, 'heading', (node) => {
        headings.push(node.depth);
      });
      visit(tree, 'table', (node) => {
        tables.push(node.children.map((row) => row.children.length));
      });
      return { code, images, headings, tables };
    }
    for (const id of ids) {
      const [ko, en] = await pair(id);
      const original = artifacts(ko);
      const edits = localizations.code[id as keyof typeof localizations.code] ?? [];
      for (const edit of edits) {
        expect(original.code, id).toContain(edit.originalSha256);
        expect(artifacts(en).code, id).toContain(edit.localizedSha256);
      }
      expect(artifacts(en), id).toEqual({
        ...original,
        code: original.code.map(
          (hash) => edits.find((edit) => edit.originalSha256 === hash)?.localizedSha256 ?? hash,
        ),
        images: original.images.map(
          (image) => localizations.images[image as keyof typeof localizations.images] ?? image,
        ),
      });
    }
  });

  it('provides English-only diagram sources and preserves the originals', async () => {
    const web = process.cwd();
    const images = new Set<string>();
    for (const article of getArticles('en')) {
      const source = await readFile(path.join(root, article.id, 'en.mdx'), 'utf8');
      const { tree } = analyzeMdx(source);
      visit(tree, 'code', (node) => {
        expect(node.value, article.id).not.toMatch(/[가-힣ㄱ-ㅎㅏ-ㅣ]/);
      });
      visit(tree, 'image', (node) => {
        images.add(imageReplacements[node.url as keyof typeof imageReplacements] ?? node.url);
      });
    }
    for (const [original, localized] of Object.entries(localizations.images)) {
      const files = await Promise.all([
        readFile(path.join(web, 'public', original)),
        readFile(path.join(web, 'public', localized)),
        readFile(path.join(web, 'public', localized.replace(/\.png$/, '.svg')), 'utf8'),
      ]);
      expect(files[0].length, original).toBeGreaterThan(0);
      expect(files[1].subarray(0, 8), localized).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(files[2], localized).not.toMatch(/[가-힣ㄱ-ㅎㅏ-ㅣ]/);
      expect(images.has(localized), localized).toBe(true);
      expect(images.has(original), original).toBe(false);
    }
  });

  it('translates prose and image descriptions and links related posts to their English editions', async () => {
    for (const id of ids) {
      const [, en] = await pair(id);
      visit(en, 'text', (node) => {
        expect(node.value, id).not.toMatch(/[가-힣]|\{\{CODE_\d+\}\}/);
      });
      visit(en, 'image', (node) => {
        expect(node.alt?.trim(), id).toBeTruthy();
        expect(node.alt, id).not.toMatch(/[가-힣]/);
      });
      visit(en, 'link', (node) => {
        expect(node.url, id).not.toMatch(/^\/ko\/blog\//);
      });
    }
  });
});
