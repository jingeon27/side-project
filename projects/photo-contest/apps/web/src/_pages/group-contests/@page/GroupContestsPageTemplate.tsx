'use client';

import { useBackgroundQuery, type QueryRef } from '@apollo/client/react';

import { CreateGroupContestButton, GroupContestCard } from '@/features/contest';
import { GroupContentFrame } from '@/features/group';
import { GroupContestFilter, GroupContestsDocument, type GroupContestsQuery } from '@/shared/api/generated';
import { useInfiniteQuery } from '@/shared/api/infinite-query.hook';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { EmptyState } from '@/shared/ui/@core/empty-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { NotificationBell } from '@/widgets/notification-bell';

function ContestList({
  queryRef,
  hallOfFame,
}: {
  queryRef: QueryRef<GroupContestsQuery>;
  hallOfFame: boolean;
}) {
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery(queryRef, {
    select: (data) => data.groupContests,
    pageSize: 24,
  });
  if (!data.groupContests.length)
    return (
      <EmptyState
        title={hallOfFame ? '아직 지난 대회가 없어요' : '아직 진행 중인 대회가 없어요'}
        description={
          hallOfFame
            ? '대회가 끝나면 우승작과 결과를 여기서 다시 볼 수 있어요.'
            : '관리자와 부관리자가 대회를 개최할 수 있어요.'
        }
      />
    );
  return (
    <>
      <div className="grid min-w-0 grid-cols-1 gap-5 tablet:grid-cols-2">
        {data.groupContests.map(({ id }) => (
          <GroupContestCard key={id} id={id} hallOfFame={hallOfFame} />
        ))}
      </div>
      {hasNextPage ? (
        <Button variant="secondary" loading={isFetchingNextPage} onClick={() => fetchNextPage()}>
          대회 더 보기
        </Button>
      ) : null}
    </>
  );
}
function ContestQuery({ groupId, hallOfFame }: { groupId: string; hallOfFame: boolean }) {
  const [queryRef, { refetch }] = useBackgroundQuery(GroupContestsDocument, {
    variables: {
      groupId,
      filter: hallOfFame ? GroupContestFilter.Completed : GroupContestFilter.Active,
      offset: 0,
      limit: 24,
    },
    refetchWritePolicy: 'overwrite',
  });
  return (
    <AsyncBoundary fallback={<Skeleton className="h-64 w-full" />} onRetry={() => refetch()}>
      <ContestList queryRef={queryRef} hallOfFame={hallOfFame} />
    </AsyncBoundary>
  );
}
export function GroupContestsPageTemplate({
  groupId,
  hallOfFame = false,
}: {
  groupId: string;
  hallOfFame?: boolean;
}) {
  return (
    <GroupContentFrame
      groupId={groupId}
      headerActions={<NotificationBell />}
      title={hallOfFame ? '지난 대회 명예의 전당' : '그룹 대회'}
      actions={!hallOfFame ? <CreateGroupContestButton groupId={groupId} /> : undefined}
    >
      <section
        className="flex flex-col gap-5"
        aria-label={hallOfFame ? '지난 대회 명예의 전당' : '진행 중인 그룹 대회'}
      >
        <div>
          <h2 className="text-title-lg text-ink">
            {hallOfFame ? '함께 웃었던 순간들' : '이번 대회의 주인공은?'}
          </h2>
          <p className="mt-2 text-body text-muted">
            {hallOfFame
              ? '종료된 대회의 우승작과 결과를 모았어요.'
              : '게시물을 올릴 때 접수 중인 대회를 골라 참여하세요. 사진·동영상 모두 환영해요.'}
          </p>
        </div>
        <ContestQuery groupId={groupId} hallOfFame={hallOfFame} />
      </section>
    </GroupContentFrame>
  );
}
