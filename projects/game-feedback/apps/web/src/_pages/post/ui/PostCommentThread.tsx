'use client';

import { useState } from 'react';

import { Reply } from 'lucide-react';

import { Button } from '@side/design-system';

import { useSession } from '@/features/auth';
import { CommentItem } from '@/features/comment';
import { AuthorLink, UserBadges } from '@/features/user';
import type { Comment } from '@/shared/api';
import { useI18n } from '@/shared/i18n';

import type { ICommentThread } from '../model/comment-threads';
import { CommentActions } from './CommentActions';
import { PostCommentReplyForm } from './PostCommentReplyForm';

interface IPostCommentThreadProps {
  thread: ICommentThread;
  postAuthorId: string;
  locale: string;
}

function ThreadComment({
  comment,
  postAuthorId,
  locale,
  replyToName,
  canReply = true,
}: {
  comment: Comment;
  postAuthorId: string;
  locale: string;
  replyToName?: string;
  canReply?: boolean;
}) {
  const { t } = useI18n();
  const { session, requireLogin } = useSession();
  const [replying, setReplying] = useState(false);
  const author = comment.author;
  const handleReply = () => {
    if (!session.user) {
      requireLogin();
      return;
    }
    setReplying(true);
  };
  const handleCloseReply = () => setReplying(false);
  return (
    <>
      <CommentItem
        comment={comment}
        replyToName={replyToName}
        mine={author?.id === session.user?.id}
        isPostAuthor={author?.id === postAuthorId}
        authorName={author && <AuthorLink author={author} locale={locale} />}
        authorContent={author && <UserBadges author={author} compact showTag={false} />}
        actions={!comment.isDeleted && <CommentActions comment={comment} />}
        replyAction={
          !comment.isDeleted &&
          canReply &&
          !replying && (
            <Button variant="ghost" size="sm" type="button" onClick={handleReply}>
              <Reply size={14} aria-hidden="true" />
              {t('답글')}
            </Button>
          )
        }
      />
      {replying && canReply && author && !comment.isDeleted && (
        <PostCommentReplyForm
          postId={comment.postId}
          parentId={comment.id}
          nickname={author.nickname}
          onCancel={handleCloseReply}
          onSuccess={handleCloseReply}
        />
      )}
    </>
  );
}

export function PostCommentThread({ thread, postAuthorId, locale }: IPostCommentThreadProps) {
  const { t } = useI18n();
  const { comment, replies } = thread;
  const authors = new Map([comment, ...replies].map((item) => [item.id, item.author]));
  return (
    <li className="comment-thread">
      <ThreadComment comment={comment} postAuthorId={postAuthorId} locale={locale} />
      {replies.length > 0 && (
        <ol className="comment-replies" aria-label={t('답글')}>
          {replies.map((reply) => (
            <li key={reply.id}>
              <ThreadComment
                comment={reply}
                canReply={!comment.isDeleted}
                postAuthorId={postAuthorId}
                locale={locale}
                replyToName={
                  reply.isDeleted ? undefined : authors.get(reply.replyToId ?? comment.id)?.nickname
                }
              />
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}
