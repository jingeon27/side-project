import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { imageSize } from 'image-size';
import { visit } from 'unist-util-visit';
import { describe, expect, it } from 'vitest';

import { getArticles } from '@/shared/article/lib/get-articles';

import screenCaptures from '../../../docs/screen-captures.json';
import localizations from '../content/english-localizations.json';
import imageReplacements from '../content/image-replacements.json';
import { analyzeMdx } from './content';

const ids = getArticles('en').map((article) => article.id);
const root = path.join(process.cwd(), 'content/posts');
type Root = ReturnType<typeof analyzeMdx>['tree'];

async function pair(id: string) {
  const sources = await Promise.all(
    ['ko', 'en'].map((locale) => readFile(path.join(root, id, `${locale}.mdx`), 'utf8')),
  );
  return sources.map((source) => analyzeMdx(source).tree) as [Root, Root];
}

describe('English editions', () => {
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

  it('preserves code block languages and structure apart from recorded localized images', async () => {
    function artifacts(tree: Root) {
      const codeLanguages: (string | null | undefined)[] = [];
      const images: string[] = [];
      const headings: number[] = [];
      const tables: number[][] = [];
      visit(tree, 'code', (node) => {
        codeLanguages.push(node.lang);
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
      return { codeLanguages, images, headings, tables };
    }
    for (const id of ids) {
      const [ko, en] = await pair(id);
      const original = artifacts(ko);
      expect(artifacts(en), id).toEqual({
        ...original,
        images: original.images.map(
          (image) => localizations.images[image as keyof typeof localizations.images] ?? image,
        ),
      });
    }
  });

  it('provides localized diagrams or recorded actual captures and preserves the originals', async () => {
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
      ]);
      expect(files[0].length, original).toBeGreaterThan(0);
      const localizedSize = imageSize(files[1]);
      expect(localizedSize.type, localized).toBe('avif');
      expect(images.has(localized), localized).toBe(true);
      expect(images.has(original), original).toBe(false);
      const capture = screenCaptures.localizedCaptures.find(
        (entry) =>
          entry.original.replace(/\.png$/, '.avif') === original &&
          entry.replacement.replace(/\.png$/, '.avif') === localized,
      );
      if (capture) {
        const originals = await Promise.all([
          readFile(path.join(web, 'public', capture.original)),
          readFile(path.join(web, 'public', capture.replacement)),
        ]);
        expect(createHash('sha256').update(originals[0]).digest('hex')).toBe(capture.originalSha256);
        expect(createHash('sha256').update(originals[1]).digest('hex')).toBe(capture.replacementSha256);
        expect(imageSize(originals[1])).toMatchObject({ width: capture.width, height: capture.height });
        expect(localizedSize).toMatchObject({ width: capture.width, height: capture.height });
        for (const screen of capture.screens) {
          const source = await readFile(path.join(web, 'public', screen.sourceImage));
          expect(createHash('sha256').update(source).digest('hex')).toBe(screen.sourceSha256);
          expect(imageSize(source)).toMatchObject({ width: screen.sourceWidth, height: screen.sourceHeight });
          expect(screen.interfaceLocale).toBe(screen.service === 'photo-contest' ? 'ko' : 'en');
        }
        continue;
      }
      const diagram = await readFile(path.join(web, 'public', localized.replace(/\.avif$/, '.svg')), 'utf8');
      expect(diagram, localized).not.toMatch(/[가-힣ㄱ-ㅎㅏ-ㅣ]/);
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
