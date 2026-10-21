import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { visit } from 'unist-util-visit';
import { describe, expect, it } from 'vitest';

import { getArticles } from '@/entities/article/lib/get-articles';

import manifest from '../../../docs/migration-manifest.json';
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

  it('preserves complete code examples, image order, heading levels, and table dimensions', async () => {
    function artifacts(tree: Root) {
      const code: string[] = [];
      const images: string[] = [];
      const headings: number[] = [];
      const tables: number[][] = [];
      visit(tree, 'code', (node) => {
        code.push(node.value);
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
      expect(artifacts(en), id).toEqual(artifacts(ko));
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
