import Link from 'next/link';

import type { Article } from '@/shared/article/model/types';
import { labels } from '@/shared/config/labels';

import { ArticleMeta } from './article-meta';
import { ArticleThumbnail } from './article-thumbnail';

export function ArticleCard({ article }: { article: Article }) {
  const t = labels(article.locale);
  return (
    <article className="article-row">
      <Link
        prefetch={false}
        href={`/${article.locale}/blog/${article.slug}`}
        className="article-thumbnail-link"
        aria-hidden="true"
        tabIndex={-1}
      >
        <ArticleThumbnail article={article} />
      </Link>
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
