'use client';

import { Send } from 'lucide-react';

import { Button, Textarea } from '@side/design-system';

import { useSession } from '@/features/auth';
import { useCreateCommentMutation } from '@/features/comment';
import { useI18n } from '@/shared/i18n';
import { useZodForm } from '@/shared/model/form';
import { ErrorNotice, useNotify } from '@/shared/ui';

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
        <Button variant="outline" size="md" type="button" onClick={() => login()}>
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
      <div className="comment-compose">
        <Textarea
          className="min-h-touch max-h-28 min-w-0 flex-1 resize-none rounded-none border-0 px-0 py-2 leading-6 shadow-none focus-visible:border-transparent focus-visible:ring-0"
          aria-label={t('댓글 내용')}
          aria-invalid={!!form.formState.errors.body}
          {...form.register('body')}
          rows={1}
          maxLength={2000}
          placeholder={t('댓글을 남겨주세요')}
          disabled={mutation.isPending}
          required
        />
        <Button
          variant="primary"
          size="icon"
          type="submit"
          loading={mutation.isPending}
          aria-label={t('댓글 등록')}
        >
          {!mutation.isPending && <Send size={18} aria-hidden="true" />}
        </Button>
      </div>
      <ErrorNotice message={mutation.error?.message || form.formState.errors.body?.message} />
    </form>
  );
}
