'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';

import { Button, Textarea } from '@side/design-system';

import { useSession } from '@/features/auth';
import { createCommentMutationOptions } from '@/features/comment';
import { useI18n } from '@/shared/i18n';
import { useZodForm } from '@/shared/model/form';
import { Field, useNotify } from '@/shared/ui';

import { commentFormSchema } from '../../../model/content.schema';

export function PostCommentForm({ postId }: { postId: string }) {
  const client = useQueryClient();
  const { t } = useI18n();
  const { session, requireLogin } = useSession();
  const mutation = useMutation(createCommentMutationOptions(client));
  const notify = useNotify();
  const form = useZodForm(commentFormSchema, { defaultValues: { body: '' } });

  if (!session.user)
    return (
      <div className="comment-login">
        <Button variant="secondary" size="md" type="button" onClick={requireLogin}>
          {t('로그인하고 댓글 남기기')}
        </Button>
      </div>
    );

  const errorMessage = mutation.error?.message || form.formState.errors.body?.message;
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
      <Field
        label={t('댓글 내용')}
        hint={t('1~2,000자로 작성해주세요.')}
        error={errorMessage && t(errorMessage)}
      >
        <Textarea
          className="max-h-48 min-h-24"
          aria-label={t('댓글 내용')}
          {...form.register('body')}
          rows={3}
          maxLength={2000}
          readOnly={mutation.isPending}
          required
        />
      </Field>
      <div className="comment-form-actions">
        <Button
          variant="primary"
          size="md"
          type="submit"
          loading={mutation.isPending}
          icon={<Send aria-hidden />}
        >
          {t('댓글 등록')}
        </Button>
      </div>
    </form>
  );
}
