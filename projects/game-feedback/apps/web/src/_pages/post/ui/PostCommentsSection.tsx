'use client';
import { useI18n } from '@/shared/i18n';
import { useId } from 'react';
import type { Comment, Post } from '@/shared/api';
import { commentThreads } from '../model/comment-threads';
import { PostCommentForm } from './PostCommentForm';
import { PostCommentThread } from './PostCommentThread';
interface IPostCommentsSectionProps {
  post: Post;
  comments: Comment[];
  locale: string;
}
export function PostCommentsSection({ post, comments, locale }: IPostCommentsSectionProps) {
  const { t } = useI18n();
  const headingId = useId();
  const threads = commentThreads(comments);
  const count = comments.filter((comment) => !comment.isDeleted).length;
  return (
    <section className="comments-section" aria-labelledby={headingId}>
      <h2 id={headingId}>
        {t('댓글')}
        <span>{count}</span>
      </h2>
      {threads.length === 0 && <p className="comments-empty">{t('아직 댓글이 없어요.')}</p>}
      <ol className="comment-list" aria-label={t('댓글')}>
        {threads.map((thread) => (
          <PostCommentThread key={thread.comment.id} thread={thread} post={post} locale={locale} />
        ))}
      </ol>
      <PostCommentForm postId={post.id} />
    </section>
  );
}
