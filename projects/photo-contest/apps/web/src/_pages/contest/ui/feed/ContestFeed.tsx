'use client';

import { startTransition, useEffect, useRef } from 'react';

import { useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';
import { Images } from 'lucide-react';

import { LikeButton } from '@/features/like';
import { ModerationActions } from '@/features/moderation';
import {
  FEED_PAGE_SIZE,
  PHOTO_SORT,
  SubmissionCard,
  SubmissionCardActions,
  SubmissionCardBody,
  SubmissionCardCaption,
  SubmissionCardPhoto,
  type TPhotoSort,
} from '@/features/submission';
import { VoteButton } from '@/features/vote';
import { Phase, SubmissionsDocument, type SubmissionsQuery } from '@/shared/api/generated';
import { useInfiniteQuery } from '@/shared/api/infinite-query.hook';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { EmptyState } from '@/shared/ui/@core/empty-state';
import { FeedLoadMore } from '@/shared/ui/@core/feed-load-more';
import { Skeleton } from '@/shared/ui/@core/skeleton';

import type { TContestQueryRef } from '../../model/contest-query.type';

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
  const pagination = useInfiniteQuery(submissionsRef, (data) =>
    data.submissionsPage.items.filter((photo) => !photo.hidden).length <
    (context?.contest.submissionCount ?? 0)
      ? data.submissionsPage.nextOffset
      : null,
  );
  const count = context?.contest.submissionCount;
  const previousCount = useRef(count);
  useEffect(() => {
    if (previousCount.current === count) return;
    previousCount.current = count;
    if (count === undefined) return;
    // 사진 수 변화에 따른 동기화는 진행 표시 없이 기존 사진을 유지한 채 받는다.
    startTransition(async () => {
      try {
        await pagination.refetch();
      } catch {
        /* 다시 조회 오류는 피드 경계에서 복구한다. */
      }
    });
  }, [count, pagination]);
  if (!context) return null;
  const photos = pagination.data.submissionsPage.items.filter((submission) => !submission.hidden);
  if (!photos.length && !pagination.hasNextPage)
    return (
      <EmptyState
        icon={<Images />}
        title="아직 사진이 없어요"
        description="사진을 제출하면 친구들과 함께 볼 수 있어요."
      />
    );
  return (
    <div className="grid items-start gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
      <Button
        variant="ghost"
        size="sm"
        className="col-span-full justify-self-start"
        loading={pagination.isFetchingNextPage}
        onClick={() =>
          startTransition(async () => {
            try {
              await pagination.refetch();
            } catch {
              /* 피드 경계가 재시도를 제공한다. */
            }
          })
        }
      >
        사진 새로고침
      </Button>
      {photos.map((submission, index) => (
        <SubmissionCard key={submission.id} submission={submission}>
          <SubmissionCardPhoto isPriority={index === 0} />
          <SubmissionCardBody>
            <SubmissionCardCaption viewerId={viewerId} />
            <SubmissionCardActions>
              <LikeButton submission={submission} isMine={submission.author.id === viewerId} />
              {context.contest.phase === Phase.Voting ? (
                <VoteButton
                  contestId={context.contest.id}
                  submissionId={submission.id}
                  votedSubmissionId={context.contest.votedSubmissionId ?? null}
                  isMine={submission.author.id === viewerId}
                  isHidden={submission.hidden}
                />
              ) : null}
            </SubmissionCardActions>
            <ModerationActions
              submission={submission}
              contestId={context.contest.id}
              isAdmin={context.contest.isAdmin}
              isMine={submission.author.id === viewerId}
              isCompleted={false}
            />
          </SubmissionCardBody>
        </SubmissionCard>
      ))}
      <div className="col-span-full">
        <FeedLoadMore
          hasMore={pagination.hasNextPage}
          loading={pagination.isFetchingNextPage}
          loadingLabel="사진을 더 불러오는 중"
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
