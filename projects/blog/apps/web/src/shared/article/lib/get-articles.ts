import { categories } from '../model/categories';
import type { Article, Category, Locale } from '../model/types';
import index from './index.json';

const articles = index as Article[];
export function getArticles(locale: Locale): Article[] {
  return articles.filter((article) => article.locale === locale);
}
export function getArticleBySlug(locale: Locale, slug: string): Article | undefined {
  return articles.find((article) => article.locale === locale && article.slug === slug);
}
export function getArticleById(locale: Locale, id: string): Article | undefined {
  return articles.find((article) => article.locale === locale && article.id === id);
}
/** Categories with at least one article in the locale. Empty categories are not published. */
export function getPublishedCategories(locale: Locale): Category[] {
  const used = new Set(getArticles(locale).map((article) => article.category));
  return categories.filter((category) => used.has(category));
}
/** Locales whose category page has articles, for sitemap and hreflang alternates. */
export function getCategoryLocales(category: Category): Locale[] {
  return (['ko', 'en'] as const).filter((locale) => getPublishedCategories(locale).includes(category));
}
