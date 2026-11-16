'use client';

import { useEffect, useRef } from 'react';

import { skipToken, useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';
import { Medal, Share2 } from 'lucide-react';
import { match } from 'ts-pattern';

import { LikeButton } from '@/features/like';
import { ModerationActions } from '@/features/moderation';
import { countByRank, RankBadge } from '@/features/ranking';
import { buildResultShareText, useShareActions } from '@/features/share';
import {
  SubmissionCard,
  SubmissionCardActions,
  SubmissionCardBody,
  SubmissionCardCaption,
  SubmissionCardPhoto,
} from '@/features/submission';
import { ContestResultsDocument, type ContestResultsQuery } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { useIsSSR } from '@/shared/model/is-ssr.hook';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { EmptyState } from '@/shared/ui/@core/empty-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';

import type { TContestQueryRef } from '../../model/contest-query.type';
import { ResultBanner } from './ResultBanner';

function ResultsContent({
  resultsRef,
  contestRef,
  viewerId,
}: {
  resultsRef: QueryRef<ContestResultsQuery>;
  contestRef: TContestQueryRef;
  viewerId: string;
}) {
  const { data } = useReadQuery(resultsRef);
  const { data: context } = useReadQuery(contestRef);
  const shareActions = useShareActions();
  const reported = useRef(false);
  const contestId = context?.contest.id;
  useEffect(() => {
    if (contestId && !reported.current) {
      reported.current = true;
      trackEvent(ANALYTICS_EVENT.ResultViewed, { contest_id: contestId });
    }
  }, [contestId]);
  if (!context) return null;
  const winners = data.contestResults.filter(({ winner }) => winner);
  const rankCounts = countByRank(data.contestResults);
  const handleShare = async () => {
    const method = await shareActions.share(
      window.location.origin + ROUTES.CONTEST(context.contest.id),
      {
        title: '피식 대회 결과',
        text: buildResultShareText(
          context.contest.title,
          winners.map(({ submission, voteCount }) => ({
            nickname: submission.author.nickname,
            caption: submission.caption,
            voteCount,
          })),
        ),
      },
      { copied: '결과 링크를 복사했어요' },
    );
    if (method) trackEvent(ANALYTICS_EVENT.ResultShared, { contest_id: context.contest.id, method });
  };
  return (
    <div className="grid items-start gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
      <div className="col-span-full">
        <ResultBanner winnerCount={winners.length} />
      </div>
      <Button variant="secondary" className="col-span-full justify-self-start" onClick={handleShare}>
        <Share2 aria-hidden className="size-4" />
        결과 공유하기
      </Button>
      {match(data.contestResults)
        .with([], () => (
          <EmptyState
            icon={<Medal />}
            title="제출된 사진이 없어요"
            description="다음 대회에서 첫 사진을 만나보세요."
          />
        ))
        .otherwise((rows) =>
          rows.map(({ submission, rank, voteCount, winner }, index) => (
            <SubmissionCard key={submission.id} submission={submission} isWinner={winner}>
              <SubmissionCardPhoto isPriority={index === 0} />
              <SubmissionCardBody>
                <RankBadge rank={rank} sameRankCount={rankCounts.get(rank) ?? 1} className="self-start" />
                <SubmissionCardCaption viewerId={viewerId} />
                <p className="text-label text-ink">{voteCount}표</p>
                <SubmissionCardActions>
                  <LikeButton submission={submission} isMine={submission.author.id === viewerId} />
                </SubmissionCardActions>
                <ModerationActions
                  submission={submission}
                  contestId={context.contest.id}
                  isAdmin={context.contest.isAdmin}
                  isMine={submission.author.id === viewerId}
                  isCompleted
                />
              </SubmissionCardBody>
            </SubmissionCard>
          )),
        )}
    </div>
  );
}
function ResultsQuerySection({
  contestId,
  contestRef,
  viewerId,
}: {
  contestId: string;
  contestRef: TContestQueryRef;
  viewerId: string;
}) {
  // 결과는 종료 뒤에만 허용되어 사전 조회하지 않으므로 브라우저에서 시작한다.
  const [resultsRef, { refetch }] = useBackgroundQuery(
    ContestResultsDocument,
    useIsSSR() ? skipToken : { variables: { contestId } },
  );
  const fallback = <Skeleton className="aspect-square w-full" />;
  return (
    <AsyncBoundary resetKey={contestId} fallback={fallback} onRetry={refetch}>
      {resultsRef ? (
        <ResultsContent resultsRef={resultsRef} contestRef={contestRef} viewerId={viewerId} />
      ) : (
        fallback
      )}
    </AsyncBoundary>
  );
}
export function ContestResults({ contestRef, viewerId }: { contestRef: TContestQueryRef; viewerId: string }) {
  const { data } = useReadQuery(contestRef);
  if (!data) return null;
  return <ResultsQuerySection contestId={data.contest.id} contestRef={contestRef} viewerId={viewerId} />;
}
