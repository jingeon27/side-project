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
}: {
  comment: Comment;
  postAuthorId: string;
  locale: string;
  replyToName?: string;
}) {
  const { session } = useSession();
  const author = comment.author;
  return (
    <CommentItem
      comment={comment}
      replyToName={replyToName}
      mine={author?.id === session.user?.id}
      isPostAuthor={author?.id === postAuthorId}
      authorName={author && <AuthorLink author={author} locale={locale} />}
      authorContent={author && <UserBadges author={author} compact />}
      actions={!comment.isDeleted && <CommentActions comment={comment} />}
    />
  );
}

export function PostCommentThread({ thread, postAuthorId, locale }: IPostCommentThreadProps) {
  const { t } = useI18n();
  const { session, requireLogin } = useSession();
  const [replying, setReplying] = useState(false);
  const [showOlder, setShowOlder] = useState(false);
  const { comment, replies } = thread;
  const author = comment.author;
  const older = useInfiniteQuery({
    ...olderCommentRepliesOptions(comment.postId, comment.id, comment.repliesCursor),
    enabled: showOlder && !!comment.repliesCursor,
  });
  const olderReplies = [...(older.data?.pages ?? [])].reverse().flatMap((page) => page.items);
  const loadedReplies = uniqBy([...olderReplies, ...replies], (reply) => reply.id);
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

  const handleReply = () => {
    if (!session.user) {
      requireLogin();
      return;
    }
    setReplying(true);
  };

  const handleCloseReply = () => {
    setReplying(false);
  };

  return (
    <li className="comment-thread">
      <ThreadComment comment={comment} postAuthorId={postAuthorId} locale={locale} />
      {!comment.isDeleted && author && (
        <div className="comment-reply-action">
          {/* 답글 버튼은 입력 폼으로 바뀌는 진입점이다. 펼침 상태를 가진 토글이 아니므로 aria-expanded·aria-controls를 두지 않는다. */}
          {!replying && (
            <Button variant="ghost" size="sm" type="button" onClick={handleReply}>
              <Reply size={14} aria-hidden="true" />
              {t('답글')}
            </Button>
          )}
          {replying && (
            <PostCommentReplyForm
              postId={comment.postId}
              parentId={comment.id}
              nickname={author.nickname}
              onCancel={handleCloseReply}
              onSuccess={handleCloseReply}
            />
          )}
        </div>
      )}
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
                postAuthorId={postAuthorId}
                locale={locale}
                replyToName={author?.nickname}
              />
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}
