'use client';

import { useState } from 'react';

import { useInfiniteQuery } from '@tanstack/react-query';
import { uniqBy } from 'es-toolkit';
import { Reply } from 'lucide-react';

import { Button } from '@side/design-system';

import { useSession } from '@/features/auth';
import { CommentItem, olderCommentRepliesOptions } from '@/features/comment';
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
  const [showOlder, setShowOlder] = useState(false);
  const { comment, replies } = thread;
  const older = useInfiniteQuery({
    ...olderCommentRepliesOptions(comment.postId, comment.id, comment.repliesCursor),
    enabled: showOlder && !!comment.repliesCursor,
  });
  const olderReplies = [...(older.data?.pages ?? [])].reverse().flatMap((page) => page.items);
  const loadedReplies = uniqBy([...olderReplies, ...replies], (reply) => reply.id);
  const authors = new Map([comment, ...loadedReplies].map((item) => [item.id, item.author]));
  const hasOlder =
    !!comment.repliesCursor && (!showOlder || older.isPending || older.isError || older.hasNextPage);

  const handleShowOlder = () => {
    if (!showOlder) {
      setShowOlder(true);
      return;
    }
    if (!older.data) {
      void older.refetch();
      return;
    }
    void older.fetchNextPage();
  };

  return (
    <li className="comment-thread">
      <ThreadComment comment={comment} postAuthorId={postAuthorId} locale={locale} />
      {(hasOlder || loadedReplies.length > 0) && (
        <ol className="comment-replies" aria-label={t('답글')}>
          {hasOlder && (
            <li className="comments-older">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                disabled={older.isFetching}
                onClick={handleShowOlder}
              >
                {older.isFetching ? t('이전 답글을 불러오고 있어요') : t('이전 답글 더 보기')}
              </Button>
              {older.isError && !older.isFetching && (
                <p role="alert">{t('이전 답글을 불러오지 못했어요. 다시 시도해주세요.')}</p>
              )}
            </li>
          )}
          {loadedReplies.map((reply) => (
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
