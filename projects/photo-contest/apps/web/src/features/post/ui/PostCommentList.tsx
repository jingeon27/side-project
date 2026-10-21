'use client';

import { useTransition } from 'react';

import {
  useFragment,
  useQuery,
  useQueryRefHandlers,
  useReadQuery,
  type QueryRef,
} from '@apollo/client/react';
import { MessageCircle } from 'lucide-react';

import { GalleryPostCardFragmentDoc, MeDocument, type PostCommentsQuery } from '@/shared/api/generated';
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
  const { data } = useReadQuery(commentsRef);
  const { data: viewer } = useQuery(MeDocument, { fetchPolicy: 'cache-only' });
  const { data: post, complete } = useFragment({
    fragment: GalleryPostCardFragmentDoc,
    from: { __typename: 'GalleryPost', id: postId },
  });
  const { fetchMore } = useQueryRefHandlers(commentsRef);
  const [pending, startTransition] = useTransition();

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
            <PostCommentCard
              key={id}
              id={id}
              viewerId={viewer?.me?.id}
              postAuthorId={complete ? post.author.id : undefined}
            />
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
      {complete && data.postComments.length < post.commentCount ? (
        <Button
          variant="ghost"
          size="md"
          loading={pending}
          className="self-center rounded-full px-5 text-muted"
          onClick={() =>
            startTransition(async () => {
              try {
                await fetchMore({ variables: { offset: data.postComments.length } });
              } catch {
                /* 조회 경계에서 재시도한다. */
              }
            })
          }
        >
          댓글 더 보기
        </Button>
      ) : null}
    </div>
  );
}
