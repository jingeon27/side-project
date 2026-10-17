'use client';
import { useI18n } from '@/shared/i18n';
import { Button, NativeSelect, NativeSelectOption, Textarea } from '@side/design-system';
import { Flag, LoaderCircle } from 'lucide-react';
import { ReportInputSchema, type ReportInput } from '@game-feedback/contracts';
import { ErrorNotice, Field, Modal, useNotify } from '@/shared/ui';
import { useZodForm } from '@/shared/model/form';
import { useReportMutation, reportReasons } from '@/features/moderation';
interface IReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: ReportInput['targetType'];
  targetId: string;
}
export function ReportDialog({ open, onOpenChange, targetType, targetId }: IReportDialogProps) {
  const { t } = useI18n();
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
      title={t('어떤 문제가 있나요?')}
      description={t('신고 내용은 커뮤니티 운영 검토에 사용됩니다.')}
    >
      <form
        className="form-stack"
        onSubmit={form.handleSubmit(async (body) => {
          try {
            await mutation.mutateAsync(body);
            onOpenChange(false);
            notify(t('신고를 접수했어요. 운영 검토가 필요합니다.'));
          } catch {
            /* The mutation error remains visible in the dialog. */
          }
        })}
      >
        <Field label={t('신고 사유')}>
          <NativeSelect {...form.register('reason')}>
            {reportReasons.map((item) => (
              <NativeSelectOption key={item.value} value={item.value}>
                {t(item.label)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t('추가 설명 (선택)')}>
          <Textarea {...form.register('detail')} rows={4} maxLength={1000} />
        </Field>
        <ErrorNotice message={mutation.error?.message || form.formState.errors.detail?.message} />
        <Button
          variant="primary"
          size="lg"
          fullWidth
          type="submit"
          className="button dark full"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? <LoaderCircle className="spin" size={16} /> : <Flag size={16} />}
          {t('신고 접수')}
        </Button>
      </form>
    </Modal>
  );
}
