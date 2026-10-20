import { Button } from '@side/design-system';
import { HideInputSchema } from '@game-feedback/contracts';
import { match } from 'ts-pattern';
import { useReviewReportMutation, type TAdminReport } from '@/features/moderation';
import { adminUserPath } from '@/shared/lib';
import { ErrorNotice } from '@/shared/ui';
import { ReportVisibilityActions } from './ReportVisibilityActions';

export function ReportCard({ report }: { report: TAdminReport }) {
  const review = useReviewReportMutation();
  const targetType = HideInputSchema.shape.targetType.safeParse(report.targetType);
  const status = match(report.status)
    .with('OPEN', () => '검토 대기')
    .with('REVIEWED', () => '검토 완료')
    .with('DISMISSED', () => '반려')
    .otherwise((value) => value);
  return (
    <article className="admin-card form-stack" data-report-id={report.id}>
      <h2>{report.targetType === 'USER' ? '사용자 신고' : '콘텐츠 신고'}</h2>
      <p>
        {report.reason}: {report.detail}
      </p>
      <p>{report.targetPreview}</p>
      <p>{status}</p>
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
      </div>
      {targetType.success && <ReportVisibilityActions targetType={targetType.data} report={report} />}
      <ErrorNotice error={review.error} />
    </article>
  );
}
