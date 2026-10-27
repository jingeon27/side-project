'use client';

import { useId } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';

import { Button, Textarea } from '@side/design-system';

import { updateAnswerMutationOptions } from '@/features/answer';
import { updateCommentMutationOptions } from '@/features/comment';
import { useI18n } from '@/shared/i18n';
import { useZodForm } from '@/shared/model/form';
import { BottomSheet, ErrorNotice, useNotify, type IOverlayControlProps } from '@/shared/ui';

import { answerFormSchema, commentFormSchema } from '../model/content.schema';

interface IContentEditDialogProps extends IOverlayControlProps {
  type: 'ANSWER' | 'COMMENT';
  id: string;
  body: string;
}
export function ContentEditDialog({
  open,
  onOpenChange,
  onOpenChangeComplete,
  type,
  id,
  body,
}: IContentEditDialogProps) {
  const client = useQueryClient();
  const { t } = useI18n();
  const formId = useId();
  const answer = useMutation(updateAnswerMutationOptions(client)),
    comment = useMutation(updateCommentMutationOptions(client)),
    notify = useNotify(),
    form = useZodForm(type === 'ANSWER' ? answerFormSchema : commentFormSchema, { defaultValues: { body } });
  const isPending = answer.isPending || comment.isPending,
    error = answer.error || comment.error;
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      dismissible={!isPending}
      title={type === 'ANSWER' ? t('피드백 수정') : t('댓글 수정')}
      description={t('나누고 싶은 내용을 다듬어주세요.')}
      footer={
        <>
          <Button variant="secondary" type="button" disabled={isPending} onClick={() => onOpenChange(false)}>
            {t('취소')}
          </Button>
          <Button variant="primary" size="lg" type="submit" form={formId} disabled={isPending}>
            {isPending && <LoaderCircle className="spin" size={16} />}
            {t('수정 완료')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="form-stack"
        onSubmit={form.handleSubmit(async (values) => {
          try {
            if (type === 'ANSWER') await answer.mutateAsync({ id, body: values });
            if (type === 'COMMENT') await comment.mutateAsync({ id, body: values });
            onOpenChange(false);
            notify(t('수정했어요.'));
          } catch {
            /* Mutation errors remain visible. */
          }
        })}
      >
        <Textarea
          aria-label={t('수정 내용')}
          {...form.register('body')}
          rows={6}
          minLength={type === 'ANSWER' ? 10 : 1}
          maxLength={type === 'ANSWER' ? 10000 : 2000}
          required
        />
        <ErrorNotice message={error?.message || form.formState.errors.body?.message} />
      </form>
    </BottomSheet>
  );
}
