import { match, P } from 'ts-pattern';

import type { Locale } from '@/i18n/routing';
import type { Article } from '@/shared/article/model/types';

export function normalizeSearchText(value: string, locale: Locale): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase(locale);
}

export function matchesArticleSearch(
  article: Pick<Article, 'title' | 'tags'>,
  query: string,
  locale: Locale,
): boolean {
  const normalized = normalizeSearchText(query, locale);
  return match(normalized)
    .with('', () => true)
    .with(
      P.when((text) => text.startsWith('#')),
      (text) => {
        const tagQuery = text.slice(1).trim();
        return Boolean(tagQuery) && article.tags.some((tag) => normalizeSearchText(tag, locale) === tagQuery);
      },
    )
    .otherwise(
      (text) =>
        normalizeSearchText(article.title, locale).includes(text) ||
        article.tags.some((tag) => normalizeSearchText(tag, locale).includes(text)),
    );
}
