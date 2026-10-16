import Link from 'next/link';
import type { Article } from '../model/types';
import { labels } from '@/shared/config/labels';
import { ArrowIcon } from '@/shared/ui/icon';
import { ArticleMeta } from './article-meta';

export function ArticleCard({ article, index }: { article: Article; index?: number }) {
  const t = labels(article.locale);
  return (
    <article className="article-row">
      {index !== undefined && (
        <span className="article-index" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
      )}
      <div className="article-row-content">
        <div className="article-row-top">
          <Link
            prefetch={false}
            className="category-label"
            href={`/${article.locale}/blog/category/${article.category}`}
          >
            {t.categories[article.category]}
          </Link>
          <ArticleMeta article={article} />
        </div>
        <h3>
          <Link prefetch={false} href={`/${article.locale}/blog/${article.slug}`}>
            {article.title}
            <ArrowIcon className="article-row-arrow" />
          </Link>
        </h3>
        <p>{article.description}</p>
        <div className="article-row-tags">
          {article.tags.slice(0, 3).map((tag) => (
            <Link prefetch={false} key={tag} href={`/${article.locale}/blog/tag/${encodeURIComponent(tag)}`}>
              #{tag}
            </Link>
          ))}
        </div>
      </div>
    </article>
  );
}
