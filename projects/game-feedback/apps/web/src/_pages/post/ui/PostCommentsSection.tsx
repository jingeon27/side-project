'use client';
import { useI18n } from '@/shared/i18n';
import { useId } from 'react';
import { useSession } from '@/features/auth';
import { CommentItem } from '@/features/comment';
import { AuthorLink, UserBadges } from '@/features/user';
import type { Comment, Post } from '@/shared/api';
import { ContentActions } from './ContentActions';
import { PostCommentForm } from './PostCommentForm';
interface IPostCommentsSectionProps {
  post: Post;
  comments: Comment[];
  locale: string;
}
export function PostCommentsSection({ post, comments, locale }: IPostCommentsSectionProps) {
  const { t } = useI18n();
  const { session } = useSession();
  const headingId = useId();
  return (
    <section className="comments-section" aria-labelledby={headingId}>
      <h2 id={headingId}>
        {t('댓글')}
        <span>{comments.length}</span>
      </h2>
      {comments.length === 0 && <p className="comments-empty">{t('아직 댓글이 없어요.')}</p>}
      <ol className="comment-list">
        {comments.map((comment) => (
          <li key={comment.id}>
            <CommentItem
              comment={comment}
              mine={comment.author.id === session.user?.id}
              isPostAuthor={comment.author.id === post.author.id}
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
          </li>
        ))}
      </ol>
      <PostCommentForm postId={post.id} />
    </section>
  );
}
