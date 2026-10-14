'use client';

import { useQuery } from '@apollo/client/react';
import { Trophy } from 'lucide-react';
import { useId } from 'react';

import { GroupLeaderboardDocument } from '@/shared/api/generated';
import { cn } from '@/shared/lib/cn.helper';
import { formatCount } from '@/shared/lib/format.helper';
import { getErrorMessage } from '@/shared/model/error';
import { Avatar } from '@/shared/ui/@core/avatar';
import { EmptyState } from '@/shared/ui/@core/empty-state';
import { ErrorState } from '@/shared/ui/@core/error-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';

import { countByRank, getMedalTone, getRankLabel } from '../lib/ranking.helper';

const MEDAL_CLASS_NAME = {
  gold: 'bg-gold text-ink',
  silver: 'bg-silver text-ink',
  bronze: 'bg-bronze text-ink',
} as const;

interface IGroupLeaderboardProps {
  groupId: string;
  viewerId?: string;
}

/**
 * 그룹 순위(명예의 전당). 끝난 대회만 모아 우승 횟수 → 받은 표 → 받은 좋아요 순으로 매긴다.
 * 그룹 화면과 따로 불러와 순위 계산이 늦거나 실패해도 그룹 화면은 먼저 보인다.
 */
export function GroupLeaderboard({ groupId, viewerId }: IGroupLeaderboardProps) {
  const headingId = useId();
  const { data, loading, error, refetch } = useQuery(GroupLeaderboardDocument, { variables: { groupId } });
  const entries = data?.group.leaderboard ?? [];
  const rankCounts = countByRank(entries);

  const renderBody = () => {
    if (!data && loading)
      return (
        <div role="status" aria-label="그룹 순위를 불러오는 중" className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      );
    if (!data && error)
      return (
        <ErrorState
          className="py-6"
          title="그룹 순위를 불러오지 못했어요"
          message={getErrorMessage(error)}
          onRetry={() => {
            refetch().catch(() => undefined);
          }}
        />
      );
    if (entries.length === 0)
      return (
        <EmptyState
          className="py-6"
          icon={<Trophy className="size-6" />}
          title="아직 순위가 없어요"
          description="대회가 끝나면 우승 횟수와 받은 표로 순위를 매겨요."
        />
      );
    return (
      <ol className="flex flex-col divide-y divide-line">
        {entries.map((entry) => {
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
    );
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div>
        <p className="text-micro text-brand">명예의 전당</p>
        <h2 id={headingId} className="text-title text-ink">
          그룹 순위
        </h2>
      </div>
      {renderBody()}
    </section>
  );
}
