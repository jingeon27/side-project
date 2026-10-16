import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Article } from '@/entities/article/model/types';
import { ArticleMeta } from '@/entities/article/ui/article-meta';
import { ArticleTags } from '@/entities/article/ui/article-tags';
import { ArticleCard } from '@/entities/article/ui/article-card';
import { ArticleShare } from '@/features/article-share/ui/article-share';
import { labels } from '@/shared/config/labels';
import { TableOfContents } from './table-of-contents';

export function ArticleReader({
  article,
  articles,
  children,
}: {
  article: Article;
  articles: Article[];
  children: ReactNode;
}) {
  const t = labels(article.locale);
  const currentIndex = articles.findIndex((candidate) => candidate.id === article.id);
  const previous = articles[currentIndex + 1];
  const next = articles[currentIndex - 1];
  const score = (candidate: Article) =>
    (candidate.category === article.category ? 2 : 0) +
    candidate.tags.filter((tag) => article.tags.includes(tag)).length;
  const related = articles
    .filter((candidate) => candidate.id !== article.id)
    .sort((a, b) => score(b) - score(a))
    .slice(0, 3);
  return (
    <main id="main-content" className="article-page">
      <div className="article-layout">
        <div className="article-primary">
          <header className="article-heading">
            <Link className="back-link" href={`/${article.locale}/blog`}>
              {t.common.backToBlog}
            </Link>
            <Link className="category-label" href={`/${article.locale}/blog/category/${article.category}`}>
              {t.categories[article.category]}
            </Link>
            <h1>{article.title}</h1>
            <div className="article-heading-bottom">
              <ArticleMeta article={article} showUpdated />
              <ArticleShare locale={article.locale} contentId={article.id} title={article.title} />
            </div>
            <ArticleTags article={article} />
          </header>
          <div className="mobile-toc-slot">
            <TableOfContents entries={article.toc} locale={article.locale} />
          </div>
          <article className="article-prose">{children}</article>
          {(previous || next) && (
            <nav
              className="article-pagination"
              aria-label={article.locale === 'ko' ? '이전 글과 다음 글' : 'Adjacent articles'}
            >
              {previous ? (
                <Link href={`/${article.locale}/blog/${previous.slug}`}>
                  <span>{t.article.previous}</span>
                  <strong>{previous.title}</strong>
                </Link>
              ) : (
                <div />
              )}
              {next ? (
                <Link href={`/${article.locale}/blog/${next.slug}`}>
                  <span>{t.article.next}</span>
                  <strong>{next.title}</strong>
                </Link>
              ) : (
                <div />
              )}
            </nav>
          )}
          {related.length > 0 && (
            <section className="related-section">
              <h2>{t.article.related}</h2>
              <div className="article-list">
                {related.map((candidate) => (
                  <ArticleCard key={candidate.id} article={candidate} />
                ))}
              </div>
            </section>
          )}
        </div>
        <aside className="article-sidebar">
          <TableOfContents entries={article.toc} locale={article.locale} />
        </aside>
      </div>
    </main>
  );
}
