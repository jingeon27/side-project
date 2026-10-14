'use client';

import { NetworkStatus } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { useState } from 'react';

import { LikeButton } from '@/features/like';
import { ModerationActions } from '@/features/moderation';
import { FEED_PAGE_SIZE, PHOTO_SORT, FeedLoadMore, SubmissionCard } from '@/features/submission';
import type { TPhotoSort } from '@/features/submission';
import { VoteButton } from '@/features/vote';
import { Phase, SubmissionsDocument } from '@/shared/api/generated';
import type { ContestQuery } from '@/shared/api/generated';
import { getErrorMessage } from '@/shared/model/error';
import { Button } from '@/shared/ui/@core/button';
import { EmptyState } from '@/shared/ui/@core/empty-state';
import { ErrorState } from '@/shared/ui/@core/error-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';

interface IContestFeedProps {
  contest: ContestQuery['contest'];
  viewerId: string;
  sort: TPhotoSort;
}

export function ContestFeed({ contest, viewerId, sort }: IContestFeedProps) {
  const { data, error, fetchMore, refetch, networkStatus } = useQuery(SubmissionsDocument, {
    variables: { contestId: contest.id, sort: PHOTO_SORT[sort], offset: 0, limit: FEED_PAGE_SIZE },
    notifyOnNetworkStatusChange: true,
  });
  // 마지막 페이지를 받았는지만 기억한다. 사진 목록 자체는 Apollo 캐시에서 읽는다.
  const [hasNextPage, setHasNextPage] = useState(true);
  const photos = data?.submissions.filter((submission) => !submission.hidden) ?? [];
  const loading = networkStatus !== NetworkStatus.ready;
  const handleLoadMore = async () => {
    if (loading || !hasNextPage) return;
    try {
      const result = await fetchMore({ variables: { offset: photos.length } });
      setHasNextPage(result.data.submissions.length === FEED_PAGE_SIZE);
    } catch {
      // 조회 오류는 아래 오류 안내에서 다시 시도할 수 있다.
    }
  };
  if (!data && error)
    return (
      <ErrorState
        message={getErrorMessage(error)}
        onRetry={() => {
          refetch().catch(() => undefined);
        }}
      />
    );
  if (!data) return <Skeleton className="aspect-square w-full" />;
  if (!photos.length)
    return (
      <EmptyState title="아직 사진이 없어요" description="사진을 제출하면 친구들과 함께 볼 수 있어요." />
    );
  return (
    <div className="flex flex-col gap-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          refetch()
            .then(() => setHasNextPage(true))
            .catch(() => undefined);
        }}
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
      {error ? <ErrorState message={getErrorMessage(error)} onRetry={handleLoadMore} /> : null}
      <FeedLoadMore
        hasMore={hasNextPage && photos.length >= FEED_PAGE_SIZE && photos.length < contest.submissionCount}
        loading={loading}
        onLoadMore={handleLoadMore}
      />
    </div>
  );
}
