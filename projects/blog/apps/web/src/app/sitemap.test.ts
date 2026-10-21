import { describe, expect, it } from 'vitest';

import { getArticles } from '@/entities/article/lib/get-articles';
import { siteUrl } from '@/shared/config/site';

import sitemap from './sitemap';

describe('multilingual SEO', () => {
  it('publishes exactly the existing article URLs in the sitemap', () => {
    const entries = sitemap();
    const actual = entries
      .filter((entry) => /\/(ko|en)\/blog\/[^/]+$/.test(entry.url))
      .map((entry) => entry.url)
      .sort();
    const expected = (['ko', 'en'] as const)
      .flatMap((locale) =>
        getArticles(locale).map(
          (entry) => `${siteUrl.origin}/${locale}/blog/${encodeURIComponent(entry.slug)}`,
        ),
      )
      .sort();
    expect(actual).toEqual(expected);
    for (const locale of ['ko', 'en'] as const)
      for (const article of getArticles(locale)) {
        const entry = entries.find(
          (candidate) =>
            candidate.url === `${siteUrl.origin}/${locale}/blog/${encodeURIComponent(article.slug)}`,
        )!;
        for (const language of ['ko', 'en'] as const) {
          const slug = article.translations[language];
          if (slug)
            expect(entry.alternates?.languages?.[language]).toBe(
              `${siteUrl.origin}/${language}/blog/${encodeURIComponent(slug)}`,
            );
        }
      }
    expect(entries.some((entry) => entry.url.endsWith('/ko/blog/category/engineering'))).toBe(true);
  });
});
