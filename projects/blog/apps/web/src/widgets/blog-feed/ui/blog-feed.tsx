'use client';

import { Suspense, useEffect, type ComponentProps } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { countBy } from 'es-toolkit';
import qs from 'qs';
import { match, P } from 'ts-pattern';

import { matchesArticleSearch } from '@/features/article-search/lib/matches-article-search';
import { ArticleSearch } from '@/features/article-search/ui/article-search';
import { ArticleCard } from '@/features/article/ui/article-card';
import { CategoryFilter } from '@/features/category-filter/ui/category-filter';
import type { Locale } from '@/i18n/routing';
import type { Article, Category } from '@/shared/article/model/types';
import { labels } from '@/shared/config/labels';
import { trackEvent } from '@/shared/lib/analytics/events';

import { blogFeedSearchParamsSchema } from '../model/blog-feed-search-params.schema';

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
  locale: Locale;
  articles: Article[];
  fixedCategory?: Category;
  fixedTag?: string;
}) {
  const t = labels(locale);
  const searchParams = useSearchParams();
  const params = blogFeedSearchParamsSchema.parse({
    q: searchParams.get('q') ?? undefined,
    category: searchParams.get('category') ?? undefined,
  });
  const query = params.q ?? '';
  const category = fixedCategory ?? params.category ?? 'all';
  const updateFilters = (updates: { q?: string; category?: Category | 'all' }, push = false) => {
    const url = new URL(window.location.href);
    // 쓰기는 소유한 키만 바꾸고 다른 키와 중복 키를 보존한다. 빈 값은 skipNulls로 지운다.
    const current = qs.parse(window.location.search, {
      ignoreQueryPrefix: true,
      depth: 0,
      parseArrays: false,
      duplicates: 'combine',
      arrayLimit: Infinity,
      parameterLimit: Infinity,
    });
    url.search = qs.stringify(
      {
        ...current,
        ...(updates.q !== undefined ? { q: updates.q || null } : {}),
        ...(updates.category !== undefined
          ? { category: updates.category !== 'all' && !fixedCategory ? updates.category : null }
          : {}),
      },
      { addQueryPrefix: true, arrayFormat: 'repeat', skipNulls: true },
    );
    if (url.href === window.location.href) return;
    if (push) {
      window.history.pushState(null, '', url);
      return;
    }
    window.history.replaceState(null, '', url);
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
  const handleResetFilters = () => {
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
          <button type="button" className="text-button reset-filters" onClick={handleResetFilters}>
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
            <button type="button" className="text-link" onClick={handleResetFilters}>
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
