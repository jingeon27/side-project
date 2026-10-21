'use client';
import { useI18n } from '@/shared/i18n';
import { Button, Input } from '@side/design-system';
import { useWatch } from 'react-hook-form';
import { useDeleteAccount } from '@/features/auth';
import { useZodForm } from '@/shared/model/form';
import { ErrorNotice, Field, BottomSheet } from '@/shared/ui';
import { deleteAccountSchema } from '../model/settings.schema';

interface IDeleteAccountDialogProps {
  open: boolean;
  onClose: () => void;
}
export function DeleteAccountDialog({ open, onClose }: IDeleteAccountDialogProps) {
  const { t } = useI18n();
  const form = useZodForm(deleteAccountSchema, { defaultValues: { confirmation: '' } });
  const confirmation = useWatch({ control: form.control, name: 'confirmation' });
  const deletion = useDeleteAccount();
  return (
    <BottomSheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      title={t('Game Mate를 떠나시겠어요?')}
      description={t('계정과 연결된 게임 프로필, 작성한 콘텐츠가 삭제됩니다. 이 작업은 되돌릴 수 없어요.')}
    >
      <form
        className="form-stack"
        onSubmit={form.handleSubmit(() => deletion.mutate(undefined, { onSuccess: onClose }))}
      >
        <Field label={t("계속하려면 '탈퇴'를 입력해 주세요")}>
          <Input {...form.register('confirmation')} placeholder={t('탈퇴')} required />
        </Field>
        <ErrorNotice message={form.formState.errors.confirmation?.message ?? deletion.error?.message} />
        <Button
          variant="danger"
          size="lg"
          fullWidth
          type="submit"
          className="button danger full"
          disabled={confirmation !== t('탈퇴') || deletion.isPending}
        >
          {t('계정 영구 삭제하기')}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          className="button outline full"
          type="button"
          onClick={onClose}
        >
          {t('계속 함께하기')}
        </Button>
      </form>
    </BottomSheet>
  );
}
