'use client';
import {
  GalleryPostCardFragmentDoc,
  GalleryPostsDocument,
  PostCategoryOptionsDocument,
  PublicGalleryPostsDocument,
  SetPostCategoryDocument,
  type PostCategoryOptionsQuery,
} from '@/shared/api/generated';
import { useZodForm } from '@/shared/model/form';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { BottomSheet, type IBottomSheetControlProps } from '@/shared/ui/@core/bottom-sheet';
import { Button } from '@/shared/ui/@core/button';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import {
  useBackgroundQuery,
  useFragment,
  useMutation,
  useReadQuery,
  type QueryRef,
} from '@apollo/client/react';
import { overlay } from 'overlay-kit';
import { z } from 'zod';
import { resetGalleryPosts } from '../model/post.cache';
import { PostCategorySelect } from './PostCategorySelect';

const categorySchema = z.object({ categoryId: z.string() });
function CategoryForm({
  queryRef,
  postId,
  categoryId,
  onClose,
}: {
  queryRef: QueryRef<PostCategoryOptionsQuery>;
  postId: string;
  categoryId?: string;
  onClose: () => void;
}) {
  const { data } = useReadQuery(queryRef);
  const form = useZodForm(categorySchema, {
    defaultValues: { categoryId: data.group.categories.some((c) => c.id === categoryId) ? categoryId : '' },
  });
  const [save, { loading }] = useMutation(SetPostCategoryDocument, {
    update: resetGalleryPosts,
    refetchQueries: [GalleryPostsDocument, PublicGalleryPostsDocument],
    awaitRefetchQueries: true,
  });
  return (
    <form
      className="mx-auto flex w-full max-w-app flex-col gap-5"
      onSubmit={form.handleSubmit(async (values) => {
        try {
          await save({ variables: { postId, categoryId: values.categoryId || null } });
          onClose();
        } catch {
          /* ErrorLink가 알린다. */
        }
      })}
    >
      <PostCategorySelect
        categories={data.group.categories}
        disabled={loading}
        {...form.register('categoryId')}
      />
      <Button type="submit" loading={loading}>
        분류 저장하기
      </Button>
    </form>
  );
}
function PostCategoryBottomSheet({
  postId,
  groupId,
  categoryId,
  isOpen,
  onClose,
  unmount,
}: IBottomSheetControlProps & { postId: string; groupId: string; categoryId?: string }) {
  const [queryRef, { refetch }] = useBackgroundQuery(PostCategoryOptionsDocument, {
    variables: { id: groupId },
    fetchPolicy: 'network-only',
  });
  return (
    <BottomSheet.Root isOpen={isOpen} onClose={onClose} unmount={unmount}>
      <BottomSheet.Header title="게시물 카테고리 변경" />
      <BottomSheet.Content>
        <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="h-24 w-full" />}>
          <CategoryForm queryRef={queryRef} postId={postId} categoryId={categoryId} onClose={onClose} />
        </AsyncBoundary>
      </BottomSheet.Content>
    </BottomSheet.Root>
  );
}
export function PostCategoryEditor({ postId }: { postId: string }) {
  const { data: post, complete } = useFragment({
    fragment: GalleryPostCardFragmentDoc,
    from: { __typename: 'GalleryPost', id: postId },
  });
  if (!complete || !post.canDelete) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`${post.title} 분류 변경`}
      onClick={() =>
        overlay.open(({ isOpen, close, unmount }) => (
          <PostCategoryBottomSheet
            postId={postId}
            groupId={post.groupId}
            categoryId={post.category?.id}
            isOpen={isOpen}
            onClose={close}
            unmount={unmount}
          />
        ))
      }
    >
      분류 변경
    </Button>
  );
}
