'use client';

import { Fragment, type ReactNode } from 'react';

import { useBackgroundQuery, type QueryRef } from '@apollo/client/react';

import {
  GroupContestsDocument,
  type GroupContestFilter,
  type GroupContestsQuery,
} from '@/shared/api/generated';
import { useInfiniteQuery } from '@/shared/api/infinite-query.hook';
import { useObservableQueryRef } from '@/shared/api/observable-query-ref.hook';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { Skeleton } from '@/shared/ui/@core/skeleton';

const PAGE_SIZE = 24;

interface IContestRowsProps {
  /** 대회가 하나도 없을 때의 안내 */
  empty: ReactNode;
  renderContest: (id: string) => ReactNode;
}

function ContestRows({
  queryRef,
  empty,
  renderContest,
}: IContestRowsProps & { queryRef: QueryRef<GroupContestsQuery> }) {
  const observableQuery = useObservableQueryRef(queryRef);
  const pagination = useInfiniteQuery(observableQuery, (data) => data.groupContestsPage.nextOffset);
  if (!pagination.data.groupContestsPage.items.length) return empty;
  return (
    <>
      <div className="grid min-w-0 grid-cols-1 gap-5 tablet:grid-cols-2">
        {pagination.data.groupContestsPage.items.map((contest) => (
          <Fragment key={contest.id}>{renderContest(contest.id)}</Fragment>
        ))}
      </div>
      {pagination.hasNextPage ? (
        <Button
          variant="secondary"
          loading={pagination.isFetchingNextPage}
          onClick={pagination.fetchNextPage}
        >
          대회 더 보기
        </Button>
      ) : null}
    </>
  );
}

/** 진행 중·지난 대회 화면이 함께 쓰는 목록 조회와 페이지 넘김. 화면마다 필터·빈 안내·카드를 넘긴다. */
export function GroupContestList({
  groupId,
  filter,
  empty,
  renderContest,
}: IContestRowsProps & { groupId: string; filter: GroupContestFilter }) {
  const [queryRef, { refetch }] = useBackgroundQuery(GroupContestsDocument, {
    variables: { groupId, filter, offset: 0, limit: PAGE_SIZE },
    refetchWritePolicy: 'overwrite',
  });
  return (
    <AsyncBoundary fallback={<Skeleton className="h-64 w-full" />} onRetry={refetch}>
      <ContestRows queryRef={queryRef} empty={empty} renderContest={renderContest} />
    </AsyncBoundary>
  );
}
