'use client';
import { useI18n } from '@/shared/i18n';
import { Button, Input } from '@side/design-system';
import { Send, LoaderCircle } from 'lucide-react';
import { useSession } from '@/features/auth';
import { CommentItem, useCreateCommentMutation } from '@/features/comment';
import { AuthorLink, UserBadges } from '@/features/user';
import type { Comment, Post } from '@/shared/api';
import { ErrorNotice, useNotify } from '@/shared/ui';
import { useZodForm } from '@/shared/model/form';
import { commentFormSchema } from '../model/content.schema';
import { ContentActions } from './ContentActions';
interface IPostCommentsSectionProps {
  post: Post;
  comments: Comment[];
  locale: string;
}
export function PostCommentsSection({ post, comments, locale }: IPostCommentsSectionProps) {
  const { t } = useI18n();
  const { session, login } = useSession(),
    mutation = useCreateCommentMutation(),
    notify = useNotify(),
    form = useZodForm(commentFormSchema, { defaultValues: { body: '' } });
  return (
    <section className="comments-section">
      <h2>
        {t('짧은 이야기')}
        <span>{comments.length}</span>
      </h2>
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          authorName={<AuthorLink author={comment.author} locale={locale} />}
          authorContent={<UserBadges author={comment.author} compact />}
          actions={
            <ContentActions
              type="COMMENT"
              id={comment.id}
              author={comment.author}
              body={comment.body}
              post={post}
              locale={locale}
            />
          }
        />
      ))}
      {session?.user ? (
        <form
          className="comment-form"
          onSubmit={form.handleSubmit(async (body) => {
            try {
              await mutation.mutateAsync({ postId: post.id, body });
              form.reset();
              notify(t('댓글을 남겼어요.'));
            } catch {
              /* The mutation error remains visible and the form keeps the draft. */
            }
          })}
        >
          <Input
            aria-label={t('댓글 내용')}
            {...form.register('body')}
            maxLength={2000}
            placeholder={t('궁금한 점이나 짧은 응원을 남겨주세요')}
            required
          />
          <Button
            variant="primary"
            size="md"
            type="submit"
            className="button dark"
            disabled={mutation.isPending}
            aria-label={t('댓글 등록')}
          >
            {mutation.isPending ? <LoaderCircle size={17} className="spin" /> : <Send size={17} />}
          </Button>
        </form>
      ) : (
        <button className="text-button" onClick={login}>
          {t('로그인하고 댓글 남기기 →')}
        </button>
      )}
      <ErrorNotice message={mutation.error?.message || form.formState.errors.body?.message} />
    </section>
  );
}
