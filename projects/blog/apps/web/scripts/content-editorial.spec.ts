import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import manifest from '../../../docs/migration-manifest.json';
import imageReplacements from '../content/image-replacements.json';
import enSeo from '../seo/en.json';
import koSeo from '../seo/ko.json';

const contentRoot = path.join(process.cwd(), 'content/posts');
const editions = [
  { locale: 'ko', seo: koSeo },
  { locale: 'en', seo: enSeo },
] as const;

describe('edited article contracts', () => {
  it('keeps the original publication dates of migrated articles', async () => {
    for (const post of manifest.posts) {
      const meta = JSON.parse(
        await readFile(path.join(contentRoot, post.contentId, 'meta.json'), 'utf8'),
      ) as { publishedAt: string };

      expect(new Date(meta.publishedAt).getTime(), post.contentId).toBe(new Date(post.publishedAt).getTime());
    }
  });

  it.each(editions)('introduces migrated articles in $locale with a short summary', async ({ locale }) => {
    for (const post of manifest.posts) {
      const source = await readFile(path.join(contentRoot, post.contentId, `${locale}.mdx`), 'utf8');
      const summary = source.match(/^<Summary>\s*\n([\s\S]*?)\n<\/Summary>/)?.[1];

      expect(summary?.trim(), post.contentId).toBeTruthy();
    }
  });

  it.each(editions)(
    'links the FSD article to the AI workflow article in $locale',
    async ({ locale, seo }) => {
      const source = await readFile(path.join(contentRoot, 'fsd-layer-boundaries', `${locale}.mdx`), 'utf8');
      const workflowPath = `/${locale}/blog/${seo.posts['plan-gated-ai-workflow'].slug}`;

      expect(source).toContain(`](${workflowPath})`);
    },
  );

  it.each(editions)(
    'keeps product screenshots and a separate infrastructure article link in $locale',
    async ({ locale }) => {
      const source = await readFile(path.join(contentRoot, 'side-project-design', `${locale}.mdx`), 'utf8');

      for (const image of ['01-service-screens', '09-product-interactions']) {
        const archived = `/images/posts/side-project-design/${image}.png`;
        const replacement = Object.entries(imageReplacements).find(
          ([original]) => original === archived,
        )?.[1];
        expect(source).toContain(replacement ?? archived);
      }
      const seo = locale === 'ko' ? koSeo : enSeo;
      expect(source).toContain(`](/${locale}/blog/${seo.posts['side-project-infrastructure'].slug})`);
    },
  );
});
