import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';

import type { HideInputSchema } from '@game-feedback/contracts';
import { Button, Input } from '@side/design-system';

import { visibilityMutationOptions, type TAdminReport } from '@/features/moderation';
import { useZodForm } from '@/shared/model';
import { ErrorNotice } from '@/shared/ui';

import { reportVisibilitySchema } from '../model/report-visibility.schema';

interface IReportVisibilityActionsProps {
  targetType: z.output<typeof HideInputSchema>['targetType'];
  report: TAdminReport;
}

export function ReportVisibilityActions({ targetType, report }: IReportVisibilityActionsProps) {
  const client = useQueryClient();
  const visibility = useMutation(visibilityMutationOptions(client));
  const form = useZodForm(reportVisibilitySchema, { defaultValues: { reason: '' } });
  // 감사 기록에는 신고자의 문장 대신 관리자가 입력한 사유를 남긴다.
  const submitVisibility = (hidden: boolean) =>
    form.handleSubmit(async ({ reason }) => {
      try {
        await visibility.mutateAsync({ targetType, targetId: report.targetId, hidden, reason });
        form.reset();
      } catch {
        // 다시 시도할 수 있게 입력한 사유를 남긴다.
      }
    });
  const handleHide = submitVisibility(true);
  const handleUnhide = submitVisibility(false);
  // 숨김과 해제가 같은 사유 칸을 쓰므로 Enter가 한쪽 조치를 고르지 않게 form 제출을 두지 않는다.
  return (
    <div className="form-stack">
      <label>
        숨김 사유
        <Input
          {...form.register('reason')}
          maxLength={500}
          placeholder="숨김 또는 해제 사유"
          aria-invalid={Boolean(form.formState.errors.reason)}
        />
      </label>
      {form.formState.errors.reason && <p role="alert">사유를 입력해주세요.</p>}
      <div className="admin-actions">
        <Button type="button" variant="secondary" disabled={visibility.isPending} onClick={handleHide}>
          콘텐츠 숨김
        </Button>
        <Button type="button" variant="secondary" disabled={visibility.isPending} onClick={handleUnhide}>
          숨김 해제
        </Button>
      </div>
      <ErrorNotice error={visibility.error} />
    </div>
  );
}
