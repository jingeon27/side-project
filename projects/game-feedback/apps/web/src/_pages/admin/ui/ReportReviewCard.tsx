'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { appRoutes } from '@game-feedback/bridge';
import { Button } from '@side/design-system';
import {
  reviewReportMutationOptions,
  hideContentMutationOptions,
  reportReasons,
  type TAdminReport,
} from '@/features/moderation';
import { useI18n } from '@/shared/i18n';
import { ErrorNotice } from '@/shared/ui';
import { AdminUserControls } from './AdminUserControls';
export function ReportReviewCard({ report, adminId }: { report: TAdminReport; adminId: string }) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const review = useMutation(reviewReportMutationOptions(client));
  const hide = useMutation(hideContentMutationOptions(client));
  return (
    <article className="settings-card form-stack" data-report-id={report.id}>
      <strong>{t(report.targetType === 'USER' ? '사용자 신고' : '콘텐츠 신고')}</strong>
      <p>
        {t(reportReasons.find((item) => item.value === report.reason)?.label ?? '기타')}: {report.detail}
      </p>
      {report.targetPreview && <p className="prose-body">{report.targetPreview}</p>}
      {report.targetPostId && (
        <Link className="text-button" href={appRoutes.post(locale, report.targetPostId)}>
          {t('신고 대상 보기')}
        </Link>
      )}
      <p>{t(report.status === 'OPEN' ? '검토 대기' : report.status === 'REVIEWED' ? '검토 완료' : '반려')}</p>
      <div className="admin-actions">
        <Button
          type="button"
          variant="secondary"
          disabled={review.isPending}
          onClick={() => review.mutate({ id: report.id, status: 'REVIEWED' })}
        >
          {t('검토 완료')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={review.isPending}
          onClick={() => review.mutate({ id: report.id, status: 'DISMISSED' })}
        >
          {t('반려')}
        </Button>
        {(report.targetType === 'POST' ||
          report.targetType === 'ANSWER' ||
          report.targetType === 'COMMENT') &&
          [true, false].map((hidden) => (
            <Button
              key={String(hidden)}
              type="button"
              variant="secondary"
              disabled={hide.isPending}
              onClick={() => {
                if (
                  report.targetType !== 'POST' &&
                  report.targetType !== 'ANSWER' &&
                  report.targetType !== 'COMMENT'
                )
                  return;
                hide.mutate({
                  targetType: report.targetType,
                  targetId: report.targetId,
                  hidden,
                  reason: report.detail || report.reason,
                });
              }}
            >
              {t(hidden ? '콘텐츠 숨김' : '숨김 해제')}
            </Button>
          ))}
      </div>
      {hide.isSuccess && <p role="status">{t('콘텐츠 공개 상태를 변경했어요.')}</p>}
      {report.targetUserId && <AdminUserControls adminId={adminId} userId={report.targetUserId} />}
      <ErrorNotice message={review.error?.message ?? hide.error?.message} />
    </article>
  );
}
