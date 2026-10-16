import Link from 'next/link';
import type { Article } from '../model/types';

export function ArticleTags({ article }: { article: Article }) {
  return (
    <div className="article-tags">
      {article.tags.map((tag) => (
        <Link
          prefetch={false}
          key={tag}
          href={`/${article.locale}/blog/tag/${encodeURIComponent(tag)}`}
          className="tag"
        >
          {tag}
        </Link>
      ))}
    </div>
  );
}
