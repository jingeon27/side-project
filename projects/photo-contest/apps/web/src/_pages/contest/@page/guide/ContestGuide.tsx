'use client';

import { useQueryRefHandlers, useReadQuery } from '@apollo/client/react';
import { useTransition } from 'react';

import { PhaseBadge, getPhaseDeadline, getPhaseGuide } from '@/features/contest';
import { formatDateTime } from '@/shared/lib/format.helper';
import { Button } from '@/shared/ui/@core/button';

import type { TContestQueryRef } from '../model/contest-query.type';

export function ContestGuide({ contestRef }: { contestRef: TContestQueryRef }) {
  const { data } = useReadQuery(contestRef);
  const { refetch } = useQueryRefHandlers(contestRef);
  const [pending, startTransition] = useTransition();
  if (!data) return null;
  const { contest } = data;
  const deadline = getPhaseDeadline(contest.phase, contest);
  const guide = getPhaseGuide({
    phase: contest.phase,
    hasSubmitted: Boolean(contest.mySubmissionId),
    hasVoted: Boolean(contest.votedSubmissionId),
  });
  const handleRefresh = () =>
    startTransition(async () => {
      try {
        await refetch();
      } catch {
        /* 조회 실패는 대회의 경계가 안내한다. */
      }
    });
  return (
    <section className="rounded-card bg-brand-soft p-4">
      <PhaseBadge phase={contest.phase} />
      <h2 className="mt-3 text-title text-ink">{guide.title}</h2>
      <p className="mt-1 text-body text-muted">{guide.description}</p>
      <p className="mt-3 text-caption text-muted">
        {deadline.label} {formatDateTime(deadline.at)}
      </p>
      <Button variant="ghost" size="sm" className="mt-2" loading={pending} onClick={handleRefresh}>
        대회 상태 새로고침
      </Button>
    </section>
  );
}
