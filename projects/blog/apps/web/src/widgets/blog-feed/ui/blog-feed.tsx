'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Article } from '@/entities/article/model/types';
import { ArticleCard } from '@/entities/article/ui/article-card';
import { ArticleSearch } from '@/features/article-search/ui/article-search';
import { matchesArticleSearch } from '@/features/article-search/lib/matches-article-search';
import { CategoryFilter, type Category } from '@/features/category-filter/ui/category-filter';
import { labels, type UiLocale } from '@/shared/config/labels';
import { trackEvent } from '@/shared/lib/analytics/events';

export function BlogFeed({
  locale,
  articles,
  fixedCategory,
  fixedTag,
}: {
  locale: UiLocale;
  articles: Article[];
  fixedCategory?: Category;
  fixedTag?: string;
}) {
  const t = labels(locale);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>(fixedCategory ?? 'all');
  const counts = useMemo(
    () =>
      articles.reduce<Record<string, number>>(
        (result, article) => {
          result.all = (result.all ?? 0) + 1;
          result[article.category] = (result[article.category] ?? 0) + 1;
          return result;
        },
        { all: 0 },
      ),
    [articles],
  );
  const searchArticles = articles.filter(
    (article) =>
      (category === 'all' || article.category === category) && (!fixedTag || article.tags.includes(fixedTag)),
  );
  const filtered = searchArticles.filter((article) => matchesArticleSearch(article, query, locale));
  useEffect(() => {
    if (!query.trim()) return;
    const timer = setTimeout(() => trackEvent('search_performed', { has_query: true }), 600);
    return () => clearTimeout(timer);
  }, [query]);
  const isFiltered = Boolean(query || (category !== 'all' && !fixedCategory));
  const resetFilters = () => {
    setQuery('');
    setCategory(fixedCategory ?? 'all');
  };
  return (
    <div className="blog-feed">
      <div className="feed-search">
        <ArticleSearch locale={locale} value={query} onChange={setQuery} articles={searchArticles} />
      </div>
      {!fixedCategory && (
        <CategoryFilter
          locale={locale}
          selected={category}
          counts={counts}
          onChange={(next) => {
            setCategory(next);
            trackEvent('category_selected', { category_id: next });
          }}
        />
      )}
      <div className="feed-toolbar">
        <p aria-live="polite">
          <strong>{filtered.length}</strong> {t.blog.results}
        </p>
        {isFiltered && (
          <button type="button" className="text-button reset-filters" onClick={resetFilters}>
            {t.common.clearFilters}
          </button>
        )}
      </div>
      {filtered.length ? (
        <div className="article-list">
          {filtered.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>{articles.length ? t.common.noResults : t.common.empty}</h2>
          <p>{articles.length ? t.common.noResultsDescription : t.common.emptyDescription}</p>
          {articles.length ? (
            <button type="button" className="text-link" onClick={resetFilters}>
              {t.common.clearFilters}
            </button>
          ) : (
            locale === 'en' && (
              <Link className="text-link" href="/ko/blog">
                {t.common.koreanArticles}
              </Link>
            )
          )}
        </div>
      )}
    </div>
  );
}
