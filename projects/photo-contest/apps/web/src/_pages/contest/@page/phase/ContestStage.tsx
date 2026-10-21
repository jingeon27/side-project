'use client';

import { useTransition } from 'react';
import { useSearchParams } from 'next/navigation';

import { useReadQuery } from '@apollo/client/react';
import { match } from 'ts-pattern';

import { Phase } from '@/shared/api/generated';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { replaceSearchParams } from '@/shared/model/router';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/@core/segmented-control';

import { ContestFeed } from '../feed/ContestFeed';
import type { TContestQueryRef } from '../model/contest-query.type';
import { contestSearchSchema } from '../model/contest-search.schema';
import { ContestResults } from '../results/ContestResults';

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
          onValueChange={(next) =>
            startTransition(() => {
              const nextSort = contestSearchSchema.parse({ sort: next }).sort;
              replaceSearchParams({ sort: nextSort });
              trackEvent(ANALYTICS_EVENT.PhotoSortChanged, { contest_id: contest.id, sort: nextSort });
            })
          }
        >
          <SegmentedControlItem value="latest">최신순</SegmentedControlItem>
          <SegmentedControlItem value="popular">좋아요순</SegmentedControlItem>
        </SegmentedControl>
        <ContestFeed key={sort} contestRef={contestRef} viewerId={viewerId} sort={sort} />
      </>
    ))
    .with(Phase.Completed, () => (
      <ContestResults key={contest.id} contestRef={contestRef} viewerId={viewerId} />
    ))
    .exhaustive();
}
