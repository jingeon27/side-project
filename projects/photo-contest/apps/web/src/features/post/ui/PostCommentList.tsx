'use client';

import { useFragment, type QueryRef } from '@apollo/client/react';
import { MessageCircle } from 'lucide-react';

import { GalleryPostCardFragmentDoc, type PostCommentsQuery } from '@/shared/api/generated';
import { useInfiniteQuery } from '@/shared/api/infinite-query.hook';
import { formatCount } from '@/shared/lib/format.helper';
import { Button } from '@/shared/ui/@core/button';

import { PostCommentCard } from './PostCommentCard';

export function PostCommentList({
  commentsRef,
  postId,
}: {
  commentsRef: QueryRef<PostCommentsQuery>;
  postId: string;
}) {
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery(commentsRef, {
    select: (data) => data.postComments,
    pageSize: 24,
    canFetchMore: (data) => data.postComments.length < data.postCommentCount,
  });
  const { data: post, complete } = useFragment({
    fragment: GalleryPostCardFragmentDoc,
    from: { __typename: 'GalleryPost', id: postId },
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 text-caption text-muted">
        <p>
          함께 나누는 이야기
          {complete ? (
            <span className="ml-1.5 font-semibold text-ink">{formatCount(post.commentCount)}</span>
          ) : null}
        </p>
        <p>최신순</p>
      </div>
      {data.postComments.length ? (
        <ul aria-label="게시물 댓글" className="flex flex-col gap-5">
          {data.postComments.map(({ id }) => (
            <PostCommentCard key={id} id={id} />
          ))}
        </ul>
      ) : (
        <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-4 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-neutral-soft text-muted">
            <MessageCircle aria-hidden className="size-6" strokeWidth={1.5} />
          </span>
          <p className="text-subtitle text-ink">첫 댓글을 남겨보세요.</p>
          <p className="text-caption text-muted">함께 웃은 포인트, 가벼운 한마디면 충분해요.</p>
        </div>
      )}
      {hasNextPage ? (
        <Button
          variant="ghost"
          size="md"
          loading={isFetchingNextPage}
          className="self-center rounded-full px-5 text-muted"
          onClick={() => fetchNextPage()}
        >
          댓글 더 보기
        </Button>
      ) : null}
    </div>
  );
}
