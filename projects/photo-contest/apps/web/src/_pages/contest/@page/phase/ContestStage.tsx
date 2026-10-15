'use client';

import { useReadQuery } from '@apollo/client/react';
import { useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { match } from 'ts-pattern';

import { Phase } from '@/shared/api/generated';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { replaceSearchParams } from '@/shared/model/router';
import { ClientOnly } from '@/shared/ui/@core/async-boundary';
import { SegmentedControl } from '@/shared/ui/@core/segmented-control';
import { Skeleton } from '@/shared/ui/@core/skeleton';

import { ContestFeed } from '../feed/ContestFeed';
import { ContestResults } from '../results/ContestResults';
import { contestSearchSchema } from '../model/contest-search.schema';
import type { TContestQueryRef } from '../model/contest-query.type';

const SORT_OPTIONS = [
  { value: 'latest', label: '최신순' },
  { value: 'popular', label: '좋아요순' },
] as const;

export function ContestStage({ contestRef, viewerId }: { contestRef: TContestQueryRef; viewerId: string }) {
  const { data } = useReadQuery(contestRef);
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const { sort } = contestSearchSchema.parse({ sort: searchParams.get('sort') ?? undefined });
  if (!data) return null;
  const { contest } = data;
  return match(contest.phase)
    .with(Phase.Upcoming, () => null)
    .with(Phase.Submission, Phase.Voting, () => (
      <>
        <SegmentedControl
          label="사진 정렬"
          value={sort}
          options={SORT_OPTIONS}
          onValueChange={(next) =>
            startTransition(() => {
              replaceSearchParams({ sort: next });
              trackEvent(ANALYTICS_EVENT.PhotoSortChanged, { contest_id: contest.id, sort: next });
            })
          }
        />
        <ContestFeed key={sort} contestRef={contestRef} viewerId={viewerId} sort={sort} />
      </>
    ))
    .with(Phase.Completed, () => (
      <ClientOnly fallback={<Skeleton className="aspect-square w-full" />}>
        <ContestResults key={contest.id} contestRef={contestRef} viewerId={viewerId} />
      </ClientOnly>
    ))
    .exhaustive();
}
