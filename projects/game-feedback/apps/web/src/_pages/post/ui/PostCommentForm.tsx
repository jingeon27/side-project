'use client';
import { Button, Textarea } from '@side/design-system';
import { useSession } from '@/features/auth';
import { useCreateCommentMutation } from '@/features/comment';
import { useI18n } from '@/shared/i18n';
import { useZodForm } from '@/shared/model/form';
import { Avatar, ErrorNotice, useNotify } from '@/shared/ui';
import { commentFormSchema } from '../model/content.schema';

export function PostCommentForm({ postId }: { postId: string }) {
  const { t } = useI18n();
  const { session, login } = useSession();
  const mutation = useCreateCommentMutation();
  const notify = useNotify();
  const form = useZodForm(commentFormSchema, { defaultValues: { body: '' } });

  if (!session.user)
    return (
      <div className="comment-login">
        <Button variant="outline" size="md" type="button" onClick={login}>
          {t('로그인하고 댓글 남기기')}
        </Button>
      </div>
    );

  return (
    <form
      className="comment-form"
      onSubmit={form.handleSubmit(async (body) => {
        try {
          await mutation.mutateAsync({ postId, body });
          form.reset();
          notify(t('댓글을 남겼어요.'));
        } catch {
          /* Keep the draft and show the mutation error beside the composer. */
        }
      })}
    >
      <div className="comment-form-author">
        <Avatar name={session.user.nickname} size="small" />
        <strong>{session.user.nickname}</strong>
      </div>
      <Textarea
        aria-label={t('댓글 내용')}
        aria-invalid={!!form.formState.errors.body}
        {...form.register('body')}
        rows={3}
        maxLength={2000}
        placeholder={t('댓글을 남겨주세요')}
        required
      />
      <ErrorNotice message={mutation.error?.message || form.formState.errors.body?.message} />
      <div className="comment-form-actions">
        <Button variant="primary" size="md" type="submit" loading={mutation.isPending}>
          {t('댓글 등록')}
        </Button>
      </div>
    </form>
  );
}
