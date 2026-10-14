'use client';

import { useQuery } from '@apollo/client/react';
import { Share2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { LikeButton } from '@/features/like';
import { ModerationActions } from '@/features/moderation';
import { RankBadge, ResultBanner, countByRank } from '@/features/ranking';
import { buildResultShareText, useShareActions } from '@/features/share';
import { SubmissionCard } from '@/features/submission';
import { ContestResultsDocument } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { getErrorMessage } from '@/shared/model/error';
import { Button } from '@/shared/ui/@core/button';
import { EmptyState } from '@/shared/ui/@core/empty-state';
import { ErrorState } from '@/shared/ui/@core/error-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';

export function ContestResults({
  contestId,
  title,
  viewerId,
  isAdmin,
}: {
  contestId: string;
  title: string;
  viewerId: string;
  isAdmin: boolean;
}) {
  const { data, error, refetch } = useQuery(ContestResultsDocument, { variables: { contestId } });
  const shareActions = useShareActions();
  const reported = useRef(false);
  useEffect(() => {
    if (data && !reported.current) {
      reported.current = true;
      trackEvent(ANALYTICS_EVENT.ResultViewed, { contest_id: contestId });
    }
  }, [data, contestId]);
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
  const results = data.contestResults;
  const winners = results.filter(({ winner }) => winner);
  const rankCounts = countByRank(results);
  const handleShare = async () => {
    const method = await shareActions.share(
      `${window.location.origin}${ROUTES.CONTEST(contestId)}`,
      {
        title: '웃긴순간 대회 결과',
        text: buildResultShareText(
          title,
          winners.map(({ submission, voteCount }) => ({
            nickname: submission.author.nickname,
            caption: submission.caption,
            voteCount,
          })),
        ),
      },
      { copied: '결과 링크를 복사했어요' },
    );
    if (method) trackEvent(ANALYTICS_EVENT.ResultShared, { contest_id: contestId, method });
  };
  return (
    <div className="flex flex-col gap-4">
      <ResultBanner winnerCount={winners.length} />
      <Button variant="secondary" onClick={handleShare}>
        <Share2 aria-hidden className="size-4" />
        결과 공유하기
      </Button>
      {!results.length ? (
        <EmptyState title="제출된 사진이 없어요" description="다음 대회에서 첫 사진을 만나보세요." />
      ) : (
        results.map(({ submission, rank, voteCount, winner }, index) => (
          <SubmissionCard
            key={submission.id}
            submission={submission}
            viewerId={viewerId}
            isWinner={winner}
            isPriority={index === 0}
            badge={<RankBadge rank={rank} sameRankCount={rankCounts.get(rank) ?? 1} />}
            stats={<p className="text-label text-ink">{voteCount}표</p>}
            actions={<LikeButton submission={submission} isMine={submission.author.id === viewerId} />}
            moderation={
              <ModerationActions
                submission={submission}
                contestId={contestId}
                isAdmin={isAdmin}
                isMine={submission.author.id === viewerId}
                isCompleted
              />
            }
          />
        ))
      )}
    </div>
  );
}
