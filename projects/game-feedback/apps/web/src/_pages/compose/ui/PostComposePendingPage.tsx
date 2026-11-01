'use client';

import { useI18n } from '@/shared/i18n';
import { LoadingState } from '@/shared/ui';
import { CommunityPage } from '@/widgets/community-shell';

export function PostComposePendingPage({ locale }: { locale: string }) {
  const { t } = useI18n();
  return (
    <CommunityPage screenKey="compose" locale={locale} topbar={null}>
      <section className="post-compose-page" aria-busy="true">
        <div className="compose-heading">
          <span className="compose-back" aria-hidden="true" />
          <h1>{t('글쓰기')}</h1>
        </div>
        <div role="status" aria-label={t('글쓰기')}>
          <LoadingState />
        </div>
      </section>
    </CommunityPage>
  );
}
