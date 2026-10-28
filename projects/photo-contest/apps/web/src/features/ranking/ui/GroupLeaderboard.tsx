'use client';

import { useId } from 'react';

import { useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';
import { Trophy } from 'lucide-react';
import { match } from 'ts-pattern';

import { GroupLeaderboardDocument, type GroupLeaderboardQuery } from '@/shared/api/generated';
import { cn } from '@/shared/lib/cn.helper';
import { formatCount } from '@/shared/lib/format.helper';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Avatar } from '@/shared/ui/@core/avatar';
import { EmptyState } from '@/shared/ui/@core/empty-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';

import { countByRank, getMedalTone, getRankLabel, type TMedalTone } from '../lib/ranking.helper';

const MEDAL_CLASS_NAME = {
  gold: 'bg-gold text-ink',
  silver: 'bg-silver text-ink',
  bronze: 'bg-bronze text-ink',
} as const satisfies Record<TMedalTone, string>;

function LeaderboardContent({
  rankingRef,
  viewerId,
}: {
  rankingRef: QueryRef<GroupLeaderboardQuery>;
  viewerId?: string;
}) {
  const {
    data: {
      group: { leaderboard: entries },
    },
  } = useReadQuery(rankingRef);
  const rankCounts = countByRank(entries);
  return match(entries)
    .with([], () => (
      <EmptyState
        className="py-6"
        icon={<Trophy className="size-6" />}
        title="아직 순위가 없어요"
        description="대회가 끝나면 우승 횟수와 받은 표로 순위를 매겨요."
      />
    ))
    .otherwise((rows) => (
      <ol className="flex flex-col divide-y divide-line">
        {rows.map((entry) => {
          const medal = getMedalTone(entry.rank);
          return (
            <li key={entry.user.id} className="flex min-h-16 items-center gap-3 py-2">
              <span
                aria-hidden
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full text-label tabular-nums',
                  medal ? MEDAL_CLASS_NAME[medal] : 'bg-sunken text-muted',
                )}
              >
                {entry.rank}
              </span>
              <span className="sr-only">{getRankLabel(entry.rank, rankCounts.get(entry.rank) ?? 1)}</span>
              <Avatar name={entry.user.nickname} src={entry.user.avatar} size="sm" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="line-clamp-1 text-label text-ink">
                  {entry.user.nickname}
                  {entry.user.id === viewerId ? <span className="text-muted"> (나)</span> : null}
                </span>
                <span className="text-caption text-muted">
                  우승 {formatCount(entry.wins)}회 · 받은 표 {formatCount(entry.votesReceived)} · 좋아요{' '}
                  {formatCount(entry.likesReceived)}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    ));
}

export function GroupLeaderboard({ groupId, viewerId }: { groupId: string; viewerId?: string }) {
  const headingId = useId();
  const [rankingRef, { refetch }] = useBackgroundQuery(GroupLeaderboardDocument, { variables: { groupId } });
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div>
        <p className="text-micro text-brand">명예의 전당</p>
        <h2 id={headingId} className="text-title text-ink">
          그룹 순위
        </h2>
      </div>
      <AsyncBoundary
        resetKey={groupId}
        errorTitle="그룹 순위를 불러오지 못했어요"
        onRetry={() => refetch()}
        fallback={
          <div role="status" aria-label="그룹 순위를 불러오는 중" className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        }
      >
        <LeaderboardContent rankingRef={rankingRef} viewerId={viewerId} />
      </AsyncBoundary>
    </section>
  );
}
