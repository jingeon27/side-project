'use client';

import { Suspense, useEffect, type ComponentProps } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { countBy } from 'es-toolkit';
import { match, P } from 'ts-pattern';

import { matchesArticleSearch } from '@/features/article-search/lib/matches-article-search';
import { ArticleSearch } from '@/features/article-search/ui/article-search';
import { ArticleCard } from '@/features/article/ui/article-card';
import { CategoryFilter, type Category } from '@/features/category-filter/ui/category-filter';
import { categories } from '@/shared/article/model/categories';
import type { Article } from '@/shared/article/model/types';
import { labels, type UiLocale } from '@/shared/config/labels';
import { trackEvent } from '@/shared/lib/analytics/events';

export function BlogFeed(props: ComponentProps<typeof BlogFeedContent>) {
  return (
    <Suspense
      fallback={
        <div className="article-list">
          {props.articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      }
    >
      <BlogFeedContent {...props} />
    </Suspense>
  );
}

function BlogFeedContent({
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
  const searchParams = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const category =
    fixedCategory ?? categories.find((entry) => entry === searchParams.get('category')) ?? 'all';
  const updateFilters = (updates: { q?: string; category?: Category | 'all' }, push = false) => {
    const url = new URL(window.location.href);
    if (updates.q !== undefined) {
      if (updates.q) url.searchParams.set('q', updates.q);
      else url.searchParams.delete('q');
    }
    if (updates.category !== undefined) {
      if (updates.category !== 'all' && !fixedCategory) url.searchParams.set('category', updates.category);
      else url.searchParams.delete('category');
    }
    if (url.href === window.location.href) return;
    if (push) window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
  };
  const counts = { ...countBy(articles, (article) => article.category), all: articles.length };
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
    updateFilters({ q: '', category: 'all' }, true);
  };
  return (
    <div className="blog-feed">
      <div className="feed-search">
        <ArticleSearch
          locale={locale}
          value={query}
          onChange={(next) => updateFilters({ q: next })}
          articles={searchArticles}
        />
      </div>
      {!fixedCategory && (
        <CategoryFilter
          locale={locale}
          selected={category}
          counts={counts}
          onChange={(next) => {
            updateFilters({ category: next }, true);
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
      {match([filtered.length > 0, articles.length > 0] as const)
        .with([true, P._], () => (
          <div className="article-list">
            {filtered.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        ))
        .with([false, true], () => (
          <div className="empty-state">
            <h2>{t.common.noResults}</h2>
            <p>{t.common.noResultsDescription}</p>
            <button type="button" className="text-link" onClick={resetFilters}>
              {t.common.clearFilters}
            </button>
          </div>
        ))
        .with([false, false], () => (
          <div className="empty-state">
            <h2>{t.common.empty}</h2>
            <p>{t.common.emptyDescription}</p>
            {locale === 'en' && (
              <Link className="text-link" href="/ko/blog">
                {t.common.koreanArticles}
              </Link>
            )}
          </div>
        ))
        .exhaustive()}
    </div>
  );
}
