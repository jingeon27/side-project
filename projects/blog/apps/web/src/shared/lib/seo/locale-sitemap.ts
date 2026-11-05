import type { MetadataRoute } from 'next';

import { maxBy } from 'es-toolkit';

import { locales, type Locale } from '@/i18n/routing';
import {
  getArticles,
  getCategoryLocales,
  getIndexedTags,
  getPublishedCategories,
} from '@/shared/article/lib/get-articles';
import type { Article } from '@/shared/article/model/types';
import { absoluteUrl } from '@/shared/config/site';

import { articleAlternates, articlePath, withDefaultLanguage } from './metadata';

const articleLastModified = (article: Article) => article.updatedAt || article.publishedAt;

/**
 * A listing changes when an article it shows changes. Dates mix date-only and offset
 * datetime formats, so they are compared as instants rather than as strings.
 */
export function latestModified(articles: readonly Article[]): string | undefined {
  const latest = maxBy(articles, (article) => Date.parse(articleLastModified(article)));
  return latest && articleLastModified(latest);
}

/** The conventional /sitemap.xml address: an index pointing at each locale's own file. */
export function sitemapIndexXml(): string {
  const sitemaps = locales.map((locale) => {
    const lastModified = latestModified(getArticles(locale));
    const lastmod = lastModified ? `<lastmod>${lastModified}</lastmod>` : '';
    return `<sitemap><loc>${absoluteUrl(`/${locale}/sitemap.xml`)}</loc>${lastmod}</sitemap>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemaps.join('')}</sitemapindex>`;
}

/** A sitemap may only list URLs under its own directory, so each locale publishes its own file. */
export function localeSitemap(locale: Locale): MetadataRoute.Sitemap {
  const articles = getArticles(locale);
  const newest = latestModified(articles);
  const corePaths: [string, readonly Locale[], string?][] = [
    ['', locales, newest],
    ['/blog', locales, newest],
    // Static copy without a tracked edit date: no lastmod is more honest than an invented one.
    ['/about', locales],
    // Empty categories are not published, so neither listed nor offered as an alternate.
    ...getPublishedCategories(locale).map((category): [string, Locale[], string?] => [
      `/blog/category/${category}`,
      getCategoryLocales(category),
      latestModified(articles.filter((article) => article.category === category)),
    ]),
  ];
  const entries: MetadataRoute.Sitemap = corePaths.map(([path, pathLocales, lastModified]) => ({
    url: absoluteUrl(`/${locale}${path}`),
    lastModified,
    alternates: {
      languages: withDefaultLanguage(
        Object.fromEntries(pathLocales.map((value) => [value, absoluteUrl(`/${value}${path}`)])),
      ),
    },
  }));
  for (const tag of getIndexedTags(locale)) {
    entries.push({
      url: absoluteUrl(`/${locale}/blog/tag/${encodeURIComponent(tag)}`),
      lastModified: latestModified(articles.filter((article) => article.tags.includes(tag))),
    });
  }
  return [
    ...entries,
    ...articles.map((article) => ({
      url: absoluteUrl(articlePath(locale, article.slug)),
      lastModified: articleLastModified(article),
      alternates: { languages: withDefaultLanguage(articleAlternates(article)) },
    })),
  ];
}
