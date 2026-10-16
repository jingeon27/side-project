'use client';

import { useState } from 'react';
import { labels, type UiLocale } from '@/shared/config/labels';
import { trackEvent } from '@/shared/lib/analytics/events';

export function ArticleShare({
  locale,
  contentId,
  title,
}: {
  locale: UiLocale;
  contentId: string;
  title: string;
}) {
  const [status, setStatus] = useState('');
  const t = labels(locale);
  async function share() {
    const url = new URL(window.location.href);
    url.hash = '';
    try {
      if (navigator.share) {
        await navigator.share({ title, url: url.href });
        trackEvent('article_shared', { content_id: contentId, method: 'native' });
      } else {
        await navigator.clipboard.writeText(url.href);
        setStatus(t.article.copied);
        trackEvent('article_shared', { content_id: contentId, method: 'copy_link' });
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus(t.article.shareFailed);
    }
  }
  return (
    <div className="share-control">
      <button type="button" className="share-button" onClick={share}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 16V3m-4 4 4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
        </svg>
        {t.article.share}
      </button>
      <span className="share-status" role={status ? 'status' : undefined}>
        {status}
      </span>
    </div>
  );
}
