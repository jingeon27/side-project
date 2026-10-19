import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Button } from '@side/design-system';
import { HideInputSchema } from '@game-feedback/contracts';
import {
  reportOptions,
  reviewMutationOptions,
  visibilityMutationOptions,
  type TAdminReport,
} from '@/features/moderation';
import { adminUserPath } from '@/shared/lib';
import { ErrorNotice } from '@/shared/ui';
export function ReportInbox() {
  const { data: reports } = useSuspenseQuery(reportOptions());
  return (
    <section aria-label="신고함" className="form-stack">
      <h1>신고함</h1>
      {!reports.length && <p>접수된 신고가 없습니다.</p>}
      {reports.map((report) => (
        <ReportCard key={report.id} report={report} />
      ))}
    </section>
  );
}
function ReportCard({ report }: { report: TAdminReport }) {
  const client = useQueryClient();
  const review = useMutation(reviewMutationOptions(client));
  const visibility = useMutation(visibilityMutationOptions(client));
  const handleVisibility = (hidden: boolean) => {
    const targetType = HideInputSchema.shape.targetType.safeParse(report.targetType);
    if (!targetType.success) return;
    visibility.mutate({
      targetType: targetType.data,
      targetId: report.targetId,
      hidden,
      reason: report.detail || report.reason,
    });
  };
  return (
    <article className="admin-card form-stack" data-report-id={report.id}>
      <h2>{report.targetType === 'USER' ? '사용자 신고' : '콘텐츠 신고'}</h2>
      <p>
        {report.reason}: {report.detail}
      </p>
      <p>{report.targetPreview}</p>
      <p>{report.status === 'OPEN' ? '검토 대기' : report.status === 'REVIEWED' ? '검토 완료' : '반려'}</p>
      {report.targetUserId && <a href={adminUserPath(report.targetUserId)}>사용자 관리</a>}
      <div className="admin-actions">
        <Button
          type="button"
          variant="secondary"
          disabled={review.isPending}
          onClick={() => review.mutate({ id: report.id, status: 'REVIEWED' })}
        >
          검토 완료
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={review.isPending}
          onClick={() => review.mutate({ id: report.id, status: 'DISMISSED' })}
        >
          반려
        </Button>
        {report.targetType !== 'USER' && (
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={visibility.isPending}
              onClick={() => handleVisibility(true)}
            >
              콘텐츠 숨김
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={visibility.isPending}
              onClick={() => handleVisibility(false)}
            >
              숨김 해제
            </Button>
          </>
        )}
      </div>
      <ErrorNotice error={review.error ?? visibility.error} />
    </article>
  );
}
