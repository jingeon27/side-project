'use client';

import { useState } from 'react';

import { Reply } from 'lucide-react';

import { Button } from '@side/design-system';

import { useSession } from '@/features/auth';
import { CommentItem } from '@/features/comment';
import { AuthorLink, UserBadges } from '@/features/user';
import type { Comment, Post } from '@/shared/api';
import { useI18n } from '@/shared/i18n';

import type { ICommentThread } from '../model/comment-threads';
import { ContentActions } from './ContentActions';
import { PostCommentReplyForm } from './PostCommentReplyForm';

interface IPostCommentThreadProps {
  thread: ICommentThread;
  post: Post;
  locale: string;
}

function ThreadComment({
  comment,
  post,
  locale,
  replyToName,
}: {
  comment: Comment;
  post: Post;
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
      isPostAuthor={author?.id === post.author.id}
      authorName={author && <AuthorLink author={author} locale={locale} />}
      authorContent={author && <UserBadges author={author} compact />}
      actions={
        author &&
        !comment.isDeleted && (
          <ContentActions
            type="COMMENT"
            id={comment.id}
            author={author}
            body={comment.body}
            post={post}
            locale={locale}
          />
        )
      }
    />
  );
}

export function PostCommentThread({ thread, post, locale }: IPostCommentThreadProps) {
  const { t } = useI18n();
  const { session, requireLogin } = useSession();
  const [replying, setReplying] = useState(false);
  const { comment, replies } = thread;
  const author = comment.author;

  function handleReply() {
    if (!session.user) {
      requireLogin();
      return;
    }
    setReplying(true);
  }

  function handleCloseReply() {
    setReplying(false);
  }

  return (
    <li className="comment-thread">
      <ThreadComment comment={comment} post={post} locale={locale} />
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
              postId={post.id}
              parentId={comment.id}
              nickname={author.nickname}
              onCancel={handleCloseReply}
              onSuccess={handleCloseReply}
            />
          )}
        </div>
      )}
      {replies.length > 0 && (
        <ol className="comment-replies" aria-label={t('답글')}>
          {replies.map((reply) => (
            <li key={reply.id}>
              <ThreadComment comment={reply} post={post} locale={locale} replyToName={author?.nickname} />
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}
