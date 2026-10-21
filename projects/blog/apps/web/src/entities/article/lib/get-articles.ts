import type { Article, Locale } from '../model/types';
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
