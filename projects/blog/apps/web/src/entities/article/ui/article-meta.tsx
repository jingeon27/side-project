import type { Article } from '../model/types';
import { labels } from '@/shared/config/labels';

export function ArticleMeta({ article, showUpdated = false }: { article: Article; showUpdated?: boolean }) {
  const t = labels(article.locale);
  const date = new Intl.DateTimeFormat(article.locale === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <div className="article-meta">
      <time dateTime={article.publishedAt}>{date.format(new Date(article.publishedAt))}</time>
      <span>
        {article.readingMinutes}
        {article.locale === 'ko' ? '' : ' '}
        {t.common.minutes}
      </span>
      {showUpdated && article.updatedAt && article.updatedAt !== article.publishedAt && (
        <span>
          {t.common.updated}{' '}
          <time dateTime={article.updatedAt}>{date.format(new Date(article.updatedAt))}</time>
        </span>
      )}
    </div>
  );
}
