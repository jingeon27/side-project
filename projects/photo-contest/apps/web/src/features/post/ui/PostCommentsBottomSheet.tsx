'use client';

import {
  useBackgroundQuery,
  useFragment,
  useMutation,
  useQueryRefHandlers,
  useReadQuery,
  type QueryRef,
} from '@apollo/client/react';
import { useTransition } from 'react';

import {
  CreatePostCommentDocument,
  GalleryPostsDocument,
  GalleryPostCardFragmentDoc,
  PostCommentsDocument,
  type PostCommentsQuery,
} from '@/shared/api/generated';
import { useZodForm } from '@/shared/model/form';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { BottomSheet, type IBottomSheetControlProps } from '@/shared/ui/@core/bottom-sheet';
import { Button } from '@/shared/ui/@core/button';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TextArea } from '@/shared/ui/@core/text-field';

import { commentSchema } from '../model/comment.schema';
import { PostCommentCard } from './PostCommentCard';

const PAGE_SIZE = 24;

function CommentList({ commentsRef, postId }: { commentsRef: QueryRef<PostCommentsQuery>; postId: string }) {
  const { data } = useReadQuery(commentsRef);
  const { data: post, complete } = useFragment({
    fragment: GalleryPostCardFragmentDoc,
    from: { __typename: 'GalleryPost', id: postId },
  });
  const { fetchMore } = useQueryRefHandlers(commentsRef);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-caption text-muted">최신순</p>
      {data.postComments.length ? (
        <ul aria-label="게시물 댓글">
          {data.postComments.map(({ id }) => (
            <PostCommentCard key={id} id={id} />
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-body text-muted">첫 댓글을 남겨보세요.</p>
      )}
      {complete && data.postComments.length < post.commentCount ? (
        <Button
          variant="secondary"
          loading={pending}
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

function CommentForm({ postId }: { postId: string }) {
  const form = useZodForm(commentSchema, { defaultValues: { body: '' } });
  const [create] = useMutation(CreatePostCommentDocument, {
    refetchQueries: [PostCommentsDocument, GalleryPostsDocument],
    awaitRefetchQueries: true,
    onCompleted: () => form.reset(),
  });
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={form.handleSubmit(async (values) => {
        try {
          await create({ variables: { postId, ...values } });
        } catch {
          /* ErrorLink가 알리고 입력은 유지한다. */
        }
      })}
    >
      <TextArea
        label="댓글"
        required
        rows={2}
        maxLength={1000}
        placeholder="함께 웃을 이야기를 남겨보세요."
        error={form.formState.errors.body?.message}
        {...form.register('body')}
      />
      <Button type="submit" fullWidth loading={form.formState.isSubmitting}>
        댓글 올리기
      </Button>
    </form>
  );
}

export function PostCommentsBottomSheet({
  postId,
  ...controls
}: IBottomSheetControlProps & { postId: string }) {
  const [commentsRef, { refetch }] = useBackgroundQuery(PostCommentsDocument, {
    variables: { postId, offset: 0, limit: PAGE_SIZE },
    fetchPolicy: 'network-only',
    refetchWritePolicy: 'overwrite',
  });
  return (
    <BottomSheet.Root {...controls}>
      <BottomSheet.Header title="댓글" description="그룹 멤버끼리 이야기를 나눠보세요." />
      <BottomSheet.Content>
        <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="h-32 w-full" />}>
          <CommentList commentsRef={commentsRef} postId={postId} />
        </AsyncBoundary>
      </BottomSheet.Content>
      <BottomSheet.Footer>
        <CommentForm postId={postId} />
      </BottomSheet.Footer>
    </BottomSheet.Root>
  );
}
