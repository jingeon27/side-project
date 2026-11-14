import { locales } from '@/i18n/routing';

import { categories } from '../model/categories';
import type { Article, Category, Locale } from '../model/types';
import index from './index.json';

// scripts/content.ts builds this index as Article[]; the JSON import only widens unions such as category.
const articles = index as Article[];
export function getArticles(locale: Locale): Article[] {
  return articles.filter((article) => article.locale === locale);
}
export function getArticleBySlug(locale: Locale, slug: string): Article | undefined {
  return articles.find((article) => article.locale === locale && article.slug === slug);
}
/** Categories with at least one article in the locale. Empty categories are not published. */
export function getPublishedCategories(locale: Locale): Category[] {
  const used = new Set(getArticles(locale).map((article) => article.category));
  return categories.filter((category) => used.has(category));
}
/** Locales whose category page has articles, for sitemap and hreflang alternates. */
export function getCategoryLocales(category: Category): Locale[] {
  return locales.filter((locale) => getPublishedCategories(locale).includes(category));
}
/**
 * Tags worth offering to search engines. A page for a single article only repeats that
 * article, so it stays reachable from the site but is left out of the index and sitemap.
 */
export function getIndexedTags(locale: Locale): string[] {
  const tags = getArticles(locale).flatMap((article) => article.tags);
  return [...new Set(tags)].filter((tag) => tags.indexOf(tag) !== tags.lastIndexOf(tag));
}
