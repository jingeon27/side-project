import type { ReactNode } from 'react';
import Link from 'next/link';

import type { GroupContestCardFragment } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';

import { PhaseBadge } from './PhaseBadge';

/**
 * 진행 중·지난 대회 카드가 함께 쓰는 틀. 단계·참여작 수와 제목 링크를 그리고,
 * 제목 아래 일정과 본문·바로가기는 카드 종류가 넣는다.
 */
export function GroupContestCardFrame({
  contest,
  schedule,
  children,
}: {
  contest: Pick<GroupContestCardFragment, 'id' | 'groupId' | 'title' | 'phase' | 'entryCount'>;
  schedule: string;
  children: ReactNode;
}) {
  return (
    <article
      aria-label={contest.title}
      className="flex min-w-0 flex-col gap-5 rounded-card border border-line bg-surface p-5 tablet:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PhaseBadge phase={contest.phase} />
        <p className="text-caption text-muted">참여작 {contest.entryCount}개</p>
      </div>
      <div>
        <Link
          href={ROUTES.GROUP_CONTEST(contest.groupId, contest.id)}
          className="wrap-break-word text-title-lg text-ink hover:underline underline-offset-4"
        >
          {contest.title}
        </Link>
        <p className="mt-2 text-caption text-muted">{schedule}</p>
      </div>
      {children}
    </article>
  );
}
