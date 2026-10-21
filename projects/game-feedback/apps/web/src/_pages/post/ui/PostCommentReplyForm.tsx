'use client';
import { Button, Textarea } from '@side/design-system';
import { Send } from 'lucide-react';
import { useCreateCommentMutation } from '@/features/comment';
import { useI18n } from '@/shared/i18n';
import { useZodForm } from '@/shared/model/form';
import { ErrorNotice, useNotify } from '@/shared/ui';
import { commentFormSchema } from '../model/content.schema';

interface IPostCommentReplyFormProps {
  id: string;
  postId: string;
  parentId: string;
  nickname: string;
  onCancel: () => void;
  onSuccess: () => void;
}

export function PostCommentReplyForm({
  id,
  postId,
  parentId,
  nickname,
  onCancel,
  onSuccess,
}: IPostCommentReplyFormProps) {
  const { t } = useI18n();
  const mutation = useCreateCommentMutation();
  const notify = useNotify();
  const form = useZodForm(commentFormSchema, { defaultValues: { body: '' } });

  return (
    <form
      id={id}
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
      <ErrorNotice message={mutation.error?.message || form.formState.errors.body?.message} />
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
