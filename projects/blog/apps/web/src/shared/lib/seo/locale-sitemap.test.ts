import { describe, expect, it } from 'vitest';

import { locales } from '@/i18n/routing';
import { getArticles, getPublishedCategories } from '@/shared/article/lib/get-articles';
import { categories } from '@/shared/article/model/categories';
import { siteUrl } from '@/shared/config/site';

import { localeSitemap } from './locale-sitemap';
import { articleMetadata, pageMetadata } from './metadata';

const sitemap = () => locales.flatMap((locale) => localeSitemap(locale));

describe('multilingual SEO', () => {
  it('lists only URLs under the directory of each locale sitemap', () => {
    for (const locale of locales) {
      const entries = localeSitemap(locale);
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries)
        expect(new URL(entry.url).pathname).toMatch(new RegExp(`^/${locale}(/|$)`));
    }
  });

  it('leaves hreflang to each page head so the sitemap keeps loc before lastmod', () => {
    // Next writes sitemap hreflang links before lastmod, against the sitemap schema order.
    for (const entry of sitemap()) expect(entry, entry.url).not.toHaveProperty('alternates');
  });

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
    expect(entries.some((entry) => entry.url.endsWith('/ko/blog/category/engineering'))).toBe(true);
  });

  it('offers every published translation in the article head and points x-default to Korean', () => {
    for (const locale of locales)
      for (const article of getArticles(locale)) {
        const languages = articleMetadata(article).alternates?.languages ?? {};
        for (const language of locales) {
          const slug = article.translations[language];
          if (slug)
            expect(languages[language], article.slug).toBe(
              `${siteUrl.origin}/${language}/blog/${encodeURIComponent(slug)}`,
            );
        }
        const versions = Object.keys(languages).filter((key) => key !== 'x-default');
        if (versions.length > 1 && 'ko' in languages) {
          expect(languages['x-default'], article.slug).toBe(languages.ko);
          continue;
        }
        expect(languages, article.slug).not.toHaveProperty('x-default');
      }
    expect(pageMetadata('en', 'home').alternates?.languages).toEqual({
      ko: `${siteUrl.origin}/ko`,
      en: `${siteUrl.origin}/en`,
      'x-default': `${siteUrl.origin}/ko`,
    });
  });

  it('lists only categories that have articles', () => {
    const urls = new Set(sitemap().map((entry) => entry.url));
    for (const locale of locales) {
      const published = getPublishedCategories(locale);
      expect(published.length).toBeGreaterThan(0);
      for (const category of categories) {
        const url = `${siteUrl.origin}/${locale}/blog/category/${category}`;
        const hasArticles = getArticles(locale).some((article) => article.category === category);
        expect(published.includes(category), url).toBe(hasArticles);
        expect(urls.has(url), url).toBe(hasArticles);
      }
    }
  });
});
