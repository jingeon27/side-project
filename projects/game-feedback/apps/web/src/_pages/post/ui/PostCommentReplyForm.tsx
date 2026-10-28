'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';

import { Button, Textarea } from '@side/design-system';

import { createCommentMutationOptions } from '@/features/comment';
import { useI18n } from '@/shared/i18n';
import { useZodForm } from '@/shared/model/form';
import { ErrorNotice, useNotify } from '@/shared/ui';

import { commentFormSchema } from '../model/content.schema';

interface IPostCommentReplyFormProps {
  postId: string;
  parentId: string;
  nickname: string;
  onCancel: () => void;
  onSuccess: () => void;
}

export function PostCommentReplyForm({
  postId,
  parentId,
  nickname,
  onCancel,
  onSuccess,
}: IPostCommentReplyFormProps) {
  const client = useQueryClient();
  const { t } = useI18n();
  const mutation = useMutation(createCommentMutationOptions(client));
  const notify = useNotify();
  const form = useZodForm(commentFormSchema, { defaultValues: { body: '' } });

  const errorMessage = mutation.error?.message || form.formState.errors.body?.message;
  return (
    <form
      className="comment-reply-form"
      aria-label={t('{name}님에게 답글 남기기', { name: nickname })}
      onSubmit={form.handleSubmit(async (body) => {
        try {
          await mutation.mutateAsync({ postId, body: { ...body, parentId } });
          form.reset();
          notify(t('답글을 남겼어요.'));
          onSuccess();
        } catch {
          /* Keep the reply draft so the author can retry. */
        }
      })}
    >
      <p className="comment-reply-target">{t('{name}님에게 답글 남기기', { name: nickname })}</p>
      <Textarea
        // eslint-disable-next-line jsx-a11y/no-autofocus -- 답글 버튼을 눌러 연 입력창으로 포커스를 옮긴다(e2e comment-replies가 확인).
        autoFocus
        aria-label={t('답글 내용')}
        aria-invalid={!!form.formState.errors.body}
        {...form.register('body')}
        rows={2}
        maxLength={2000}
        placeholder={t('답글을 남겨주세요')}
        disabled={mutation.isPending}
        required
      />
      <ErrorNotice message={errorMessage && t(errorMessage)} />
      <div className="comment-reply-controls">
        <Button variant="ghost" size="sm" type="button" disabled={mutation.isPending} onClick={onCancel}>
          {t('취소')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          type="submit"
          disabled={mutation.isPending}
          loading={mutation.isPending}
        >
          {!mutation.isPending && <Send size={14} aria-hidden="true" />}
          {t('답글 등록')}
        </Button>
      </div>
    </form>
  );
}
