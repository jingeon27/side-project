'use client';

import { useEffect, useRef, useTransition } from 'react';

import { useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';

import { LikeButton } from '@/features/like';
import { ModerationActions } from '@/features/moderation';
import { FEED_PAGE_SIZE, PHOTO_SORT, SubmissionCard, type TPhotoSort } from '@/features/submission';
import { VoteButton } from '@/features/vote';
import { Phase, SubmissionsDocument, type SubmissionsQuery } from '@/shared/api/generated';
import { useInfiniteQuery } from '@/shared/api/infinite-query.hook';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { EmptyState } from '@/shared/ui/@core/empty-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';

import type { TContestQueryRef } from '../model/contest-query.type';
import { FeedLoadMore } from './FeedLoadMore';

interface IContestFeedProps {
  contestRef: TContestQueryRef;
  viewerId: string;
  sort: TPhotoSort;
}
function FeedContent({
  contestRef,
  submissionsRef,
  viewerId,
}: {
  contestRef: TContestQueryRef;
  submissionsRef: QueryRef<SubmissionsQuery>;
  viewerId: string;
}) {
  const { data: context } = useReadQuery(contestRef);
  const pagination = useInfiniteQuery(submissionsRef, {
    select: (data) => data.submissions,
    pageSize: FEED_PAGE_SIZE,
    canFetchMore: (data) =>
      data.submissions.filter((photo) => !photo.hidden).length < (context?.contest.submissionCount ?? 0),
  });
  const { data, refetch } = pagination;
  const [pending, startTransition] = useTransition();
  const count = context?.contest.submissionCount;
  const previousCount = useRef(count);
  useEffect(() => {
    if (previousCount.current === count) return;
    previousCount.current = count;
    if (count === undefined) return;
    startTransition(async () => {
      try {
        await refetch();
      } catch {
        /* 다시 조회 오류는 피드 경계에서 복구한다. */
      }
    });
  }, [count, refetch, startTransition]);
  if (!context) return null;
  const { contest } = context;
  const photos = data.submissions.filter((submission) => !submission.hidden);
  const hasMore = pagination.hasNextPage;
  const handleRefresh = () =>
    startTransition(async () => {
      try {
        await refetch();
      } catch {
        /* 피드 경계가 재시도를 제공한다. */
      }
    });
  if (!photos.length && !hasMore)
    return (
      <EmptyState title="아직 사진이 없어요" description="사진을 제출하면 친구들과 함께 볼 수 있어요." />
    );
  return (
    <div className="grid items-start gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
      <Button
        variant="ghost"
        size="sm"
        className="col-span-full justify-self-start"
        loading={pending || pagination.isFetchingNextPage}
        onClick={handleRefresh}
      >
        사진 새로고침
      </Button>
      {photos.map((submission, index) => (
        <SubmissionCard
          key={submission.id}
          submission={submission}
          viewerId={viewerId}
          isPriority={index === 0}
          actions={
            <>
              <LikeButton submission={submission} isMine={submission.author.id === viewerId} />
              {contest.phase === Phase.Voting ? (
                <VoteButton
                  contestId={contest.id}
                  submissionId={submission.id}
                  votedSubmissionId={contest.votedSubmissionId ?? null}
                  isMine={submission.author.id === viewerId}
                  isHidden={submission.hidden}
                />
              ) : null}
            </>
          }
          moderation={
            <ModerationActions
              submission={submission}
              contestId={contest.id}
              isAdmin={contest.isAdmin}
              isMine={submission.author.id === viewerId}
              isCompleted={false}
            />
          }
        />
      ))}
      <div className="col-span-full">
        <FeedLoadMore
          hasMore={hasMore}
          loading={pending || pagination.isFetchingNextPage}
          onLoadMore={pagination.fetchNextPage}
        />
      </div>
    </div>
  );
}
function FeedQuerySection({
  contestId,
  contestRef,
  viewerId,
  sort,
}: IContestFeedProps & { contestId: string }) {
  const [submissionsRef, { refetch }] = useBackgroundQuery(SubmissionsDocument, {
    variables: { contestId, sort: PHOTO_SORT[sort], offset: 0, limit: FEED_PAGE_SIZE },
    refetchWritePolicy: 'overwrite',
  });
  return (
    <AsyncBoundary
      resetKey={contestId + ':' + sort}
      fallback={<Skeleton className="aspect-square w-full" />}
      onRetry={refetch}
    >
      <FeedContent contestRef={contestRef} submissionsRef={submissionsRef} viewerId={viewerId} />
    </AsyncBoundary>
  );
}
export function ContestFeed({ contestRef, viewerId, sort }: IContestFeedProps) {
  const { data } = useReadQuery(contestRef);
  if (!data) return null;
  return (
    <FeedQuerySection contestId={data.contest.id} contestRef={contestRef} viewerId={viewerId} sort={sort} />
  );
}
