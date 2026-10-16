'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Article } from '@/entities/article/model/types';
import { ArticleCard } from '@/entities/article/ui/article-card';
import { ArticleSearch } from '@/features/article-search/ui/article-search';
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
  const [tag, setTag] = useState(fixedTag ?? 'all');
  const tags = useMemo(() => [...new Set(articles.flatMap((article) => article.tags))].sort(), [articles]);
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
  const filtered = articles.filter(
    (article) =>
      (category === 'all' || article.category === category) &&
      (tag === 'all' || article.tags.includes(tag)) &&
      article.title.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale)),
  );
  useEffect(() => {
    if (!query.trim()) return;
    const timer = setTimeout(() => trackEvent('search_performed', { has_query: true }), 600);
    return () => clearTimeout(timer);
  }, [query]);
  const isFiltered = Boolean(query || (category !== 'all' && !fixedCategory) || (tag !== 'all' && !fixedTag));
  return (
    <div className="blog-feed">
      <div className="feed-search">
        <ArticleSearch locale={locale} value={query} onChange={setQuery} />
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
        <div className="feed-toolbar-controls">
          {isFiltered && (
            <button
              type="button"
              className="text-button reset-filters"
              onClick={() => {
                setQuery('');
                setCategory(fixedCategory ?? 'all');
                setTag(fixedTag ?? 'all');
              }}
            >
              {t.common.clearFilters}
            </button>
          )}
          {tags.length > 0 && !fixedTag && (
            <label className="tag-select">
              <span>{t.common.tags}</span>
              <select
                value={tag}
                onChange={(event) => {
                  setTag(event.target.value);
                  trackEvent('tag_selected', { tag_id: event.target.value });
                }}
                aria-label={t.common.tags}
              >
                <option value="all">{t.common.all}</option>
                {tags.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
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
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setQuery('');
                setCategory(fixedCategory ?? 'all');
                setTag(fixedTag ?? 'all');
              }}
            >
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
