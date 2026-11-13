'use client';

import { useEffect, useId } from 'react';
import Link from 'next/link';

import { skipToken, useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';
import { useWatch, type UseFormReturn } from 'react-hook-form';

import { NativeSelect, NativeSelectOption } from '@side/design-system';

import { GroupContestFilter, GroupContestsDocument, type GroupContestsQuery } from '@/shared/api/generated';
import { useInfiniteQuery } from '@/shared/api/infinite-query.hook';
import { useObservableQueryRef } from '@/shared/api/observable-query-ref.hook';
import { ROUTES } from '@/shared/constants/routes';
import { useIsSSR } from '@/shared/model/is-ssr.hook';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { FieldRequirement } from '@/shared/ui/@core/text-field';

import type { TPostInput, TPostValues } from '../../model/post.schema';

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
  const observableQuery = useObservableQueryRef(queryRef);
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery(
    observableQuery,
    (data) => data.groupContestsPage.nextOffset,
  );
  const id = useId();
  if (!data.groupContestsPage.items.length)
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
      <NativeSelect
        id={id}
        required
        aria-invalid={Boolean(form.formState.errors.contestId)}
        aria-describedby={form.formState.errors.contestId ? `${id}-error` : undefined}
        disabled={form.formState.isSubmitting}
        {...form.register('contestId')}
      >
        <NativeSelectOption value="">대회를 선택해 주세요</NativeSelectOption>
        {data.groupContestsPage.items.map((contest) => (
          <NativeSelectOption key={contest.id} value={contest.id}>
            {contest.title}
          </NativeSelectOption>
        ))}
      </NativeSelect>
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
export function PostContestField({
  form,
  groupId,
  defaultContestId,
}: {
  form: TPostForm;
  groupId: string;
  /** 대회 화면의 글쓰기 링크로 들어왔을 때 미리 고른 대회 */
  defaultContestId?: string;
}) {
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
      <AvailableContests
        form={form}
        groupId={groupId}
        queryRef={queryRef}
        defaultContestId={defaultContestId}
      />
    </AsyncBoundary>
  );
}
function AvailableContests({
  form,
  groupId,
  queryRef,
  defaultContestId,
}: {
  form: TPostForm;
  groupId: string;
  queryRef: QueryRef<GroupContestsQuery>;
  defaultContestId?: string;
}) {
  const participating = useWatch({ control: form.control, name: 'participateInContest' });
  const { data } = useReadQuery(queryRef);
  const contests = data.groupContestsPage.items;
  // 다음 페이지가 남아 있으면 아직 받지 않은 대회일 수 있어 마감으로 보지 않는다.
  const linkedContestClosed =
    Boolean(defaultContestId) &&
    data.groupContestsPage.nextOffset === null &&
    !contests.some((contest) => contest.id === defaultContestId);
  useEffect(() => {
    // 마감된 대회 링크의 참여 값이 서버에서 거절돼 게시를 막지 않게 일반 게시물로 되돌린다. 그 뒤 고른 대회는 둔다.
    if (!linkedContestClosed || form.getValues('contestId') !== defaultContestId) return;
    form.setValue('participateInContest', false);
    form.setValue('contestId', '');
  }, [defaultContestId, form, linkedContestClosed]);
  if (!contests.length)
    return linkedContestClosed ? (
      <p role="status" className="rounded-control border border-line p-4 text-body text-muted">
        참여하려던 대회는 접수가 끝나서 일반 게시물로 올라가요.
      </p>
    ) : null;
  return (
    <section className="flex flex-col gap-3 rounded-control border border-line p-4">
      {linkedContestClosed ? (
        <p role="status" className="text-caption text-muted">
          참여하려던 대회는 접수가 끝났어요.
        </p>
      ) : null}
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
