import { ChevronRight, Trophy } from 'lucide-react';
import Link from 'next/link';

import { Phase } from '@/shared/api/generated';
import type { ContestListItemFragment } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { formatDate, formatDateTime } from '@/shared/lib/format.helper';

import { getPhaseDeadline } from '../lib/phase.helper';
import { PhaseBadge } from './PhaseBadge';

/** 그룹 화면의 대회 한 줄. 줄 전체가 대회 화면 링크다. */
export function ContestListItem({ contest }: { contest: ContestListItemFragment }) {
  const completed = contest.phase === Phase.Completed;
  const deadline = getPhaseDeadline(contest.phase, contest);
  return (
    <Link
      href={ROUTES.CONTEST(contest.id)}
      className="flex min-h-touch items-center gap-3 rounded-card border border-line bg-surface p-4 transition-colors hover:bg-sunken active:bg-sunken"
    >
      {completed ? (
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink"
        >
          <Trophy className="size-5" />
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {completed ? null : <PhaseBadge phase={contest.phase} className="self-start" />}
        <span className="line-clamp-2 text-subtitle text-ink">{contest.title}</span>
        <span className="text-caption text-muted">
          {completed
            ? `${formatDate(contest.endsAt)} 종료 · 결과 보기`
            : `${deadline.label} ${formatDateTime(deadline.at)}`}
        </span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-subtle" />
    </Link>
  );
}
