'use client';
import { PostCategoryOptionsDocument, type PostCategoryOptionsQuery } from '@/shared/api/generated';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';
import type { UseFormReturn } from 'react-hook-form';
import type { TPostInput, TPostValues } from '../model/post.schema';
import { PostCategorySelect } from './PostCategorySelect';

type TPostForm = UseFormReturn<TPostInput, unknown, TPostValues>;
function CategoryFieldContent({
  queryRef,
  form,
}: {
  queryRef: QueryRef<PostCategoryOptionsQuery>;
  form: TPostForm;
}) {
  const { data } = useReadQuery(queryRef);
  if (!data.group.categories.length) return null;
  return (
    <PostCategorySelect
      categories={data.group.categories}
      disabled={form.formState.isSubmitting}
      {...form.register('categoryId')}
    />
  );
}
export function PostCategoryField({ groupId, form }: { groupId: string; form: TPostForm }) {
  const [queryRef, { refetch }] = useBackgroundQuery(PostCategoryOptionsDocument, {
    variables: { id: groupId },
    fetchPolicy: 'network-only',
  });
  return (
    <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="h-14 w-full" />}>
      <CategoryFieldContent queryRef={queryRef} form={form} />
    </AsyncBoundary>
  );
}
