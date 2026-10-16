'use client';
import { Flag, LoaderCircle } from 'lucide-react';
import { ReportInputSchema, type ReportInput } from '@game-feedback/contracts';
import { ErrorNotice, Field, Modal, useNotify } from '@/shared/ui';
import { useZodForm } from '@/shared/model/form';
import { useReportMutation } from '@/features/moderation';
interface IReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: ReportInput['targetType'];
  targetId: string;
}
export function ReportDialog({ open, onOpenChange, targetType, targetId }: IReportDialogProps) {
  const mutation = useReportMutation(),
    notify = useNotify(),
    form = useZodForm(ReportInputSchema, {
      defaultValues: { targetType, targetId, reason: 'SPAM', detail: '' },
    });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      dismissible={!mutation.isPending}
      title="어떤 문제가 있나요?"
      description="신고 내용은 커뮤니티 운영 검토에 사용됩니다."
    >
      <form
        className="form-stack"
        onSubmit={form.handleSubmit(async (body) => {
          try {
            await mutation.mutateAsync(body);
            onOpenChange(false);
            notify('신고를 접수했어요. 운영 검토가 필요합니다.');
          } catch {
            /* The mutation error remains visible in the dialog. */
          }
        })}
      >
        <Field label="신고 사유">
          <select {...form.register('reason')}>
            <option value="SPAM">스팸 / 광고</option>
            <option value="HARASSMENT">욕설 / 괴롭힘</option>
            <option value="PERSONAL_INFORMATION">개인정보 노출</option>
            <option value="IMPERSONATION">사칭</option>
            <option value="OTHER">기타</option>
          </select>
        </Field>
        <Field label="추가 설명 (선택)">
          <textarea {...form.register('detail')} rows={4} maxLength={1000} />
        </Field>
        <ErrorNotice message={mutation.error?.message || form.formState.errors.detail?.message} />
        <button className="button dark full" disabled={mutation.isPending}>
          {mutation.isPending ? <LoaderCircle className="spin" size={16} /> : <Flag size={16} />}신고 접수
        </button>
      </form>
    </Modal>
  );
}
