import { labels } from '@/shared/config/labels';
import { formatDate } from '@/shared/lib/date/format-date';

import type { Article } from '../model/types';

export function ArticleMeta({ article, showUpdated = false }: { article: Article; showUpdated?: boolean }) {
  const t = labels(article.locale);
  return (
    <div className="article-meta">
      <span>
        {t.common.published}{' '}
        <time dateTime={article.publishedAt}>{formatDate(article.publishedAt, article.locale)}</time>
      </span>
      <span>
        {article.readingMinutes}
        {article.locale === 'ko' ? '' : ' '}
        {t.common.minutes}
      </span>
      {showUpdated && article.updatedAt && article.updatedAt !== article.publishedAt && (
        <span>
          {t.common.updated}{' '}
          <time dateTime={article.updatedAt}>{formatDate(article.updatedAt, article.locale)}</time>
        </span>
      )}
    </div>
  );
}
