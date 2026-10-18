'use client';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useSession } from '@/features/auth';
import { adminReportOptions } from '@/features/moderation';
import { supportThreadOptions } from '@/features/support';
import { useI18n } from '@/shared/i18n';
import { AsyncBoundary, LoadingState } from '@/shared/ui';
import { ReportReviewCard } from './ReportReviewCard';
import { SupportThreadCard } from './SupportThreadCard';
export function AdminPage() {
  const { t } = useI18n();
  const { session, loading } = useSession();
  if (loading) return <LoadingState />;
  if (session.user?.role !== 'ADMIN')
    return (
      <section className="settings-card">
        <h1>{t('관리자 권한이 필요합니다.')}</h1>
      </section>
    );
  return (
    <div className="form-stack">
      <div className="page-heading">
        <h1>{t('운영 관리')}</h1>
        <p>{t('문의와 신고를 확인하고 사용자 인증과 제재를 관리합니다.')}</p>
      </div>
      <section aria-label={t('문의함')}>
        <h2>{t('문의함')}</h2>
        <AsyncBoundary title={t('문의함')} clientOnly>
          <SupportInbox adminId={session.user.id} />
        </AsyncBoundary>
      </section>
      <section aria-label={t('신고함')}>
        <h2>{t('신고함')}</h2>
        <AsyncBoundary title={t('신고함')} clientOnly>
          <Reports adminId={session.user.id} />
        </AsyncBoundary>
      </section>
    </div>
  );
}
function SupportInbox({ adminId }: { adminId: string }) {
  const { t } = useI18n();
  const { data } = useSuspenseQuery(supportThreadOptions(adminId));
  return (
    <div className="form-stack">
      {data.length === 0 && <p>{t('접수된 문의가 없습니다.')}</p>}
      {data.map((thread) => (
        <SupportThreadCard key={thread.id} thread={thread} adminId={adminId} />
      ))}
    </div>
  );
}
function Reports({ adminId }: { adminId: string }) {
  const { t } = useI18n();
  const { data } = useSuspenseQuery(adminReportOptions(adminId));
  return (
    <div className="form-stack">
      {data.length === 0 && <p>{t('접수된 신고가 없습니다.')}</p>}
      {data.map((report) => (
        <ReportReviewCard key={report.id} report={report} adminId={adminId} />
      ))}
    </div>
  );
}
