'use client';

import { useId } from 'react';
import Link from 'next/link';

import { skipToken, useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';
import { useWatch, type UseFormReturn } from 'react-hook-form';

import { GroupContestFilter, GroupContestsDocument, type GroupContestsQuery } from '@/shared/api/generated';
import { useInfiniteQuery } from '@/shared/api/infinite-query.hook';
import { ROUTES } from '@/shared/constants/routes';
import { useIsSSR } from '@/shared/model/is-ssr.hook';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { FieldRequirement } from '@/shared/ui/@core/text-field';

import type { TPostInput, TPostValues } from '../../../model/post.schema';

type TPostForm = UseFormReturn<TPostInput, unknown, TPostValues>;
function ContestSelection({
  form,
  queryRef,
  groupId,
}: {
  form: TPostForm;
  queryRef: QueryRef<GroupContestsQuery>;
  groupId: string;
}) {
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery(queryRef, {
    select: (data) => data.groupContests,
    pageSize: 48,
  });
  const id = useId();
  if (!data.groupContests.length)
    return (
      <p className="text-body text-muted">
        현재 접수 중인 대회가 없어요.{' '}
        <Link href={ROUTES.GROUP_CONTESTS(groupId)} className="underline underline-offset-4">
          그룹 대회 보기
        </Link>
      </p>
    );
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-label text-ink">
        참여할 대회
        <FieldRequirement required />
      </label>
      <select
        id={id}
        required
        aria-invalid={Boolean(form.formState.errors.contestId)}
        aria-describedby={form.formState.errors.contestId ? `${id}-error` : undefined}
        className="min-h-touch w-full rounded-control border border-line-strong bg-surface px-3 text-body text-ink"
        disabled={form.formState.isSubmitting}
        {...form.register('contestId')}
      >
        <option value="">대회를 선택해 주세요</option>
        {data.groupContests.map((contest) => (
          <option key={contest.id} value={contest.id}>
            {contest.title}
          </option>
        ))}
      </select>
      {hasNextPage ? (
        <Button size="sm" variant="ghost" loading={isFetchingNextPage} onClick={fetchNextPage}>
          대회 더 불러오기
        </Button>
      ) : null}
      {form.formState.errors.contestId ? (
        <p role="alert" id={`${id}-error`} className="text-caption text-danger">
          {form.formState.errors.contestId.message}
        </p>
      ) : null}
    </div>
  );
}
export function PostContestField({ form, groupId }: { form: TPostForm; groupId: string }) {
  const isSSR = useIsSSR();
  const [queryRef, { refetch }] = useBackgroundQuery(
    GroupContestsDocument,
    isSSR
      ? skipToken
      : {
          variables: { groupId, filter: GroupContestFilter.Open, offset: 0, limit: 48 },
          fetchPolicy: 'network-only',
        },
  );
  if (!queryRef) return null;
  return (
    <AsyncBoundary fallback={null} onRetry={refetch}>
      <AvailableContests form={form} groupId={groupId} queryRef={queryRef} />
    </AsyncBoundary>
  );
}
function AvailableContests({
  form,
  groupId,
  queryRef,
}: {
  form: TPostForm;
  groupId: string;
  queryRef: QueryRef<GroupContestsQuery>;
}) {
  const participating = useWatch({ control: form.control, name: 'participateInContest' });
  const { data } = useReadQuery(queryRef);
  if (!data.groupContests.length) return null;
  return (
    <section className="flex flex-col gap-3 rounded-control border border-line p-4">
      <label className="flex min-h-touch cursor-pointer items-center gap-3 text-label text-ink">
        <input
          type="checkbox"
          disabled={form.formState.isSubmitting}
          className="size-5 accent-ink"
          {...form.register('participateInContest')}
        />
        대회에 참여하기 <span className="text-caption text-muted">선택</span>
      </label>
      {participating ? (
        <ContestSelection form={form} groupId={groupId} queryRef={queryRef} />
      ) : (
        <p className="text-caption text-muted">선택하지 않으면 일반 그룹 게시물로 올라가요.</p>
      )}
    </section>
  );
}
