'use client';

import { useId, useState } from 'react';

import { useInfiniteQuery } from '@tanstack/react-query';
import { uniqBy } from 'es-toolkit';

import { Button } from '@side/design-system';

import { olderCommentOptions } from '@/features/comment';
import type { Comment } from '@/shared/api';
import { useI18n } from '@/shared/i18n';

import { commentThreads } from '../../model/comments/comment-threads';
import { PostCommentForm } from './composer/PostCommentForm';
import { PostCommentThread } from './thread/PostCommentThread';

interface IPostCommentsSectionProps {
  postId: string;
  postAuthorId: string;
  comments: Comment[];
  /** 상세 첫 페이지보다 이전 원댓글 스레드의 커서. 없으면 모두 받은 상태다. */
  cursor: string | null;
  locale: string;
}
export function PostCommentsSection({
  postId,
  postAuthorId,
  comments,
  cursor,
  locale,
}: IPostCommentsSectionProps) {
  const { t } = useI18n();
  const headingId = useId();
  const [showOlder, setShowOlder] = useState(false);
  const older = useInfiniteQuery({ ...olderCommentOptions(postId, cursor), enabled: showOlder && !!cursor });
  // 페이지는 최근 스레드부터 이어 받으므로 뒤 페이지일수록 오래된 댓글이다.
  const olderComments = [...(older.data?.pages ?? [])].reverse().flatMap((page) => page.items);
  const loaded = uniqBy([...olderComments, ...comments], (comment) => comment.id);
  const threads = commentThreads(loaded);
  const count = loaded.filter((comment) => !comment.isDeleted).length;
  const hasOlder = !!cursor && (!showOlder || older.isPending || older.isError || older.hasNextPage);
  // SSR은 공개 캐시에서 차단된 작성자를 뺀다. 아직 받지 않은 답글까지 공개 개수로 단정하지 않는다.
  const hasOlderReplies = threads.some(({ comment }) => Boolean(comment.repliesCursor));

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
    <section className="comments-section" aria-labelledby={headingId}>
      <h2 id={headingId}>
        {t('댓글')}
        <span>{hasOlder || hasOlderReplies ? t('{count}개 이상', { count }) : count}</span>
      </h2>
      {hasOlder && (
        <div className="comments-older">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            disabled={older.isFetching}
            onClick={handleShowOlder}
          >
            {older.isFetching ? t('이전 댓글을 불러오고 있어요') : t('이전 댓글 더 보기')}
          </Button>
          {older.isError && !older.isFetching && (
            <p role="alert">{t('이전 댓글을 불러오지 못했어요. 다시 시도해주세요.')}</p>
          )}
        </div>
      )}
      {threads.length === 0 && !hasOlder && <p className="comments-empty">{t('아직 댓글이 없어요.')}</p>}
      <ol className="comment-list" aria-label={t('댓글')}>
        {threads.map((thread) => (
          <PostCommentThread
            key={thread.comment.id}
            thread={thread}
            postAuthorId={postAuthorId}
            locale={locale}
          />
        ))}
      </ol>
      <PostCommentForm postId={postId} />
    </section>
  );
}
