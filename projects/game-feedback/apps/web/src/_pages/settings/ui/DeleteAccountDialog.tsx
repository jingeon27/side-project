'use client';

import { useId } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWatch } from 'react-hook-form';

import { Button, Input } from '@side/design-system';

import { deleteAccountMutationOptions } from '@/features/auth';
import { useI18n } from '@/shared/i18n';
import { useZodForm } from '@/shared/model/form';
import { BottomSheet, ErrorNotice, Field, useNotify } from '@/shared/ui';

import { deleteAccountSchema } from '../model/settings.schema';

interface IDeleteAccountDialogProps {
  open: boolean;
  onClose: () => void;
}
export function DeleteAccountDialog({ open, onClose }: IDeleteAccountDialogProps) {
  const client = useQueryClient();
  const notify = useNotify();
  const { t } = useI18n();
  const formId = useId();
  const form = useZodForm(deleteAccountSchema, { defaultValues: { confirmation: '' } });
  const confirmation = useWatch({ control: form.control, name: 'confirmation' });
  const deletion = useMutation(deleteAccountMutationOptions(client, notify));
  return (
    <BottomSheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      title={t('Game Mate를 떠나시겠어요?')}
      description={t('계정과 연결된 게임 프로필, 작성한 콘텐츠가 삭제됩니다. 이 작업은 되돌릴 수 없어요.')}
      dismissible={!deletion.isPending}
      footer={
        <>
          <Button variant="secondary" size="lg" type="button" onClick={onClose} disabled={deletion.isPending}>
            {t('계속 함께하기')}
          </Button>
          <Button
            variant="danger"
            size="lg"
            type="submit"
            form={formId}
            disabled={confirmation !== t('탈퇴') || deletion.isPending}
          >
            {t('계정 영구 삭제하기')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="form-stack"
        onSubmit={form.handleSubmit(() => deletion.mutate(undefined, { onSuccess: onClose }))}
      >
        <Field label={t("계속하려면 '탈퇴'를 입력해 주세요")}>
          <Input {...form.register('confirmation')} placeholder={t('탈퇴')} required />
        </Field>
        <ErrorNotice message={form.formState.errors.confirmation?.message ?? deletion.error?.message} />
      </form>
    </BottomSheet>
  );
}
