import { describe, expect, it } from 'vitest';

import { getArticles, getPublishedCategories } from '@/entities/article/lib/get-articles';
import { categories } from '@/entities/article/model/categories';
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

  it('lists and offers hreflang only for categories that have articles', () => {
    const entries = sitemap();
    for (const locale of ['ko', 'en'] as const) {
      const published = getPublishedCategories(locale);
      expect(published.length).toBeGreaterThan(0);
      for (const category of categories) {
        const url = `${siteUrl.origin}/${locale}/blog/category/${category}`;
        const hasArticles = getArticles(locale).some((article) => article.category === category);
        expect(published.includes(category), url).toBe(hasArticles);
        expect(
          entries.some((entry) => entry.url === url),
          url,
        ).toBe(hasArticles);
      }
    }
    for (const entry of entries.filter((candidate) => candidate.url.includes('/blog/category/'))) {
      for (const alternate of Object.values(entry.alternates?.languages ?? {})) {
        expect(
          entries.some((candidate) => candidate.url === alternate),
          alternate,
        ).toBe(true);
      }
    }
  });
});
