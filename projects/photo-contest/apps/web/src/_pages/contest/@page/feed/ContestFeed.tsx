'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import { useBackgroundQuery, useQueryRefHandlers, useReadQuery, type QueryRef } from '@apollo/client/react';

import { LikeButton } from '@/features/like';
import { ModerationActions } from '@/features/moderation';
import {
  FEED_PAGE_SIZE,
  FeedLoadMore,
  PHOTO_SORT,
  SubmissionCard,
  type TPhotoSort,
} from '@/features/submission';
import { VoteButton } from '@/features/vote';
import { Phase, SubmissionsDocument, type SubmissionsQuery } from '@/shared/api/generated';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { EmptyState } from '@/shared/ui/@core/empty-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';

import type { TContestQueryRef } from '../model/contest-query.type';

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
  const { data } = useReadQuery(submissionsRef);
  const { data: context } = useReadQuery(contestRef);
  const { fetchMore, refetch } = useQueryRefHandlers(submissionsRef);
  const [hasNextPage, setHasNextPage] = useState(true);
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
        setHasNextPage(true);
      } catch {
        /* 다시 조회 오류는 피드 경계에서 복구한다. */
      }
    });
  }, [count, refetch, startTransition]);
  if (!context) return null;
  const { contest } = context;
  const photos = data.submissions.filter((submission) => !submission.hidden);
  // submissionCount는 공개 사진 수다. 요청 offset과 달리 끝 여부는 공개 카드 수로 판단한다.
  const hasMore =
    hasNextPage && data.submissions.length >= FEED_PAGE_SIZE && photos.length < contest.submissionCount;
  const handleLoadMore = () => {
    if (pending || !hasNextPage) return;
    startTransition(async () => {
      try {
        // 관리자의 응답에는 숨긴 사진도 포함된다. 공개 카드 수를 offset으로 쓰면 사진이 겹친다.
        const result = await fetchMore({ variables: { offset: data.submissions.length } });
        setHasNextPage(result.data.submissions.length === FEED_PAGE_SIZE);
      } catch {
        /* 추가 조회 오류는 피드 경계에서 복구한다. */
      }
    });
  };
  const handleRefresh = () =>
    startTransition(async () => {
      try {
        await refetch();
        setHasNextPage(true);
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
        loading={pending}
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
        <FeedLoadMore hasMore={hasMore} loading={pending} onLoadMore={handleLoadMore} />
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
