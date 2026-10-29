'use client';

import { useI18n } from '@/shared/i18n';

export function PostListSkeleton() {
  const { t } = useI18n();
  return (
    <div className="post-list-skeleton" role="status" aria-label={t('게시글 불러오는 중')} aria-busy="true">
      {[0, 1, 2].map((card) => (
        <div key={card} className="skeleton-card" aria-hidden="true">
          <div />
          <div />
          <div />
          <div className="skeleton-card-footer">
            <span />
            <span />
          </div>
        </div>
      ))}
    </div>
  );
}
