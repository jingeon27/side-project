import type { Article } from '@/entities/article/model/types';
import type { UiLocale } from '@/shared/config/labels';

export function normalizeSearchText(value: string, locale: UiLocale): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase(locale);
}

export function matchesArticleSearch(
  article: Pick<Article, 'title' | 'tags'>,
  query: string,
  locale: UiLocale,
): boolean {
  const normalized = normalizeSearchText(query, locale);
  if (!normalized) return true;
  if (normalized.startsWith('#')) {
    const tagQuery = normalized.slice(1).trim();
    return Boolean(tagQuery) && article.tags.some((tag) => normalizeSearchText(tag, locale) === tagQuery);
  }
  return (
    normalizeSearchText(article.title, locale).includes(normalized) ||
    article.tags.some((tag) => normalizeSearchText(tag, locale).includes(normalized))
  );
}
