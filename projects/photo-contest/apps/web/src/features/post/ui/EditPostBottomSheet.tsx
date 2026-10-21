'use client';

import { useId } from 'react';

import {
  useBackgroundQuery,
  useFragment,
  useMutation,
  useReadQuery,
  type QueryRef,
} from '@apollo/client/react';

import {
  GalleryPostCardFragmentDoc,
  GalleryPostsDocument,
  GroupContestDocument,
  GroupContestResultsDocument,
  PostCategoryOptionsDocument,
  PublicGalleryPostsDocument,
  UpdatePostDocument,
  type PostCategoryOptionsQuery,
} from '@/shared/api/generated';
import { useZodForm } from '@/shared/model/form';
import { toast } from '@/shared/model/toast';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { BottomSheet, type IBottomSheetControlProps } from '@/shared/ui/@core/bottom-sheet';
import { Button } from '@/shared/ui/@core/button';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TextArea, TextField } from '@/shared/ui/@core/text-field';

import { postEditSchema } from '../model/post-edit.schema';
import { resetGalleryPosts } from '../model/post.cache';
import { PostCategorySelect } from './PostCategorySelect';

function EditPostForm({
  queryRef,
  postId,
  onClose,
}: {
  queryRef: QueryRef<PostCategoryOptionsQuery>;
  postId: string;
  onClose: () => void;
}) {
  const { data } = useReadQuery(queryRef);
  const { data: post, complete } = useFragment({
    fragment: GalleryPostCardFragmentDoc,
    from: { __typename: 'GalleryPost', id: postId },
  });
  const formId = useId();
  const form = useZodForm(postEditSchema, {
    defaultValues: { title: post.title ?? '', body: post.body ?? '', categoryId: post.category?.id ?? '' },
  });
  const [save] = useMutation(UpdatePostDocument, {
    update: resetGalleryPosts,
    refetchQueries: [
      GalleryPostsDocument,
      PublicGalleryPostsDocument,
      GroupContestDocument,
      GroupContestResultsDocument,
    ],
    awaitRefetchQueries: true,
  });
  if (!complete) return null;
  const categories =
    post.category && !data.group.categories.some(({ id }) => id === post.category?.id)
      ? [...data.group.categories, { id: post.category.id, name: `${post.category.name} · 보관됨` }]
      : data.group.categories;
  const { errors, isSubmitting } = form.formState;
  return (
    <>
      <BottomSheet.Content>
        <form
          id={formId}
          noValidate
          className="mx-auto flex w-full max-w-app flex-col gap-5 py-3"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              await save({ variables: { postId, ...values, categoryId: values.categoryId || null } });
              toast.success('게시물을 수정했어요');
              onClose();
            } catch {
              /* ErrorLink가 알리고 입력은 유지한다. */
            }
          })}
        >
          <TextField
            label="제목"
            required
            maxLength={80}
            disabled={isSubmitting}
            error={errors.title?.message}
            {...form.register('title')}
          />
          <TextArea
            label="내용"
            rows={5}
            maxLength={5000}
            disabled={isSubmitting}
            error={errors.body?.message}
            {...form.register('body')}
          />
          <PostCategorySelect
            categories={categories}
            disabled={isSubmitting}
            {...form.register('categoryId')}
          />
        </form>
      </BottomSheet.Content>
      <BottomSheet.Footer>
        <div className="mx-auto flex w-full max-w-app gap-3">
          <Button variant="secondary" disabled={isSubmitting} onClick={onClose}>
            취소
          </Button>
          <Button type="submit" form={formId} fullWidth loading={isSubmitting}>
            수정 저장하기
          </Button>
        </div>
      </BottomSheet.Footer>
    </>
  );
}

export function EditPostBottomSheet({
  postId,
  groupId,
  onClose,
  ...controls
}: IBottomSheetControlProps & { postId: string; groupId: string }) {
  const [queryRef, { refetch }] = useBackgroundQuery(PostCategoryOptionsDocument, {
    variables: { id: groupId },
    fetchPolicy: 'network-only',
  });
  return (
    <BottomSheet.Root {...controls} onClose={onClose}>
      <BottomSheet.Header title="게시물 수정" />
      <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="mx-5 h-64" />}>
        <EditPostForm queryRef={queryRef} postId={postId} onClose={onClose} />
      </AsyncBoundary>
    </BottomSheet.Root>
  );
}
