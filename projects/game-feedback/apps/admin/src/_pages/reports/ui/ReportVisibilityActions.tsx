import { Button } from '@side/design-system';
import type { z } from 'zod';
import type { HideInputSchema } from '@game-feedback/contracts';
import { useContentVisibilityMutation, type TAdminReport } from '@/features/moderation';
import { ErrorNotice } from '@/shared/ui';

interface IReportVisibilityActionsProps {
  targetType: z.output<typeof HideInputSchema>['targetType'];
  report: TAdminReport;
}

export function ReportVisibilityActions({ targetType, report }: IReportVisibilityActionsProps) {
  const visibility = useContentVisibilityMutation();
  function handleVisibility(hidden: boolean) {
    visibility.mutate({
      targetType,
      targetId: report.targetId,
      hidden,
      reason: report.detail || report.reason,
    });
  }
  return (
    <>
      <div className="admin-actions">
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
      </div>
      <ErrorNotice error={visibility.error} />
    </>
  );
}
