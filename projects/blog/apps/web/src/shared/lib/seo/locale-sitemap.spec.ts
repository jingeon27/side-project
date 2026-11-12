import { describe, expect, it } from 'vitest';

import { locales } from '@/i18n/routing';
import { getArticles, getIndexedTags, getPublishedCategories } from '@/shared/article/lib/get-articles';
import type { Article } from '@/shared/article/model/types';
import { siteUrl } from '@/shared/config/site';

import { latestModified, localeSitemap } from './locale-sitemap';

const article = (dates: Pick<Article, 'publishedAt' | 'updatedAt'>) => dates as Article;

describe('sitemap lastmod', () => {
  it('compares article dates as instants, not as strings', () => {
    // As strings the KST datetime sorts last, but 01:00 UTC is 10:00 KST on the same day.
    expect(
      latestModified([
        article({ publishedAt: '2026-11-02T01:00:00Z' }),
        article({ publishedAt: '2026-11-02T08:00:00+09:00' }),
      ]),
    ).toBe('2026-11-02T01:00:00Z');
  });

  it('reads a date-only edit as midnight in Asia/Seoul like the other content dates', () => {
    // UTC midnight parsing made the date-only value newer than a same-day 08:00 KST edit.
    expect(
      latestModified([
        article({ publishedAt: '2026-01-01', updatedAt: '2026-11-02' }),
        article({ publishedAt: '2026-11-02T08:00:00+09:00' }),
      ]),
    ).toBe('2026-11-02T08:00:00+09:00');
  });

  it('prefers the edit date and has no date for an empty listing', () => {
    expect(latestModified([article({ publishedAt: '2026-01-01', updatedAt: '2026-02-01' })])).toBe(
      '2026-02-01',
    );
    expect(latestModified([])).toBeUndefined();
  });

  it.each(locales)('dates each %s listing from the articles it shows', (locale) => {
    const articles = getArticles(locale);
    const lastModifiedOf = (path: string) =>
      localeSitemap(locale).find((entry) => entry.url === `${siteUrl.origin}/${locale}${path}`)?.lastModified;

    expect(lastModifiedOf('')).toBe(latestModified(articles));
    expect(lastModifiedOf('/blog')).toBe(latestModified(articles));
    for (const category of getPublishedCategories(locale))
      expect(lastModifiedOf(`/blog/category/${category}`)).toBe(
        latestModified(articles.filter((candidate) => candidate.category === category)),
      );
    for (const tag of getIndexedTags(locale))
      expect(lastModifiedOf(`/blog/tag/${encodeURIComponent(tag)}`)).toBe(
        latestModified(articles.filter((candidate) => candidate.tags.includes(tag))),
      );
  });

  it.each(locales)('lists only %s tags that have more than one article', (locale) => {
    const articles = getArticles(locale);
    const listed = localeSitemap(locale)
      .filter((entry) => entry.url.includes('/blog/tag/'))
      .map((entry) => decodeURIComponent(entry.url.split('/blog/tag/')[1] ?? ''));
    const expected = [...new Set(articles.flatMap((candidate) => candidate.tags))].filter(
      (tag) => articles.filter((candidate) => candidate.tags.includes(tag)).length > 1,
    );

    expect(listed.length).toBeGreaterThan(0);
    expect(listed.sort()).toEqual(expected.sort());
  });

  it.each(locales)('leaves only the undated %s about page without lastmod', (locale) => {
    const undated = localeSitemap(locale).filter((entry) => !entry.lastModified);
    expect(undated.map((entry) => entry.url)).toEqual([`${siteUrl.origin}/${locale}/about`]);
  });
});
