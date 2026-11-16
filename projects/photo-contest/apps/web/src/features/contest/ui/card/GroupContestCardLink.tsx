import type { ReactNode } from 'react';
import Link from 'next/link';

import type { GroupContestCardFragment } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';

/** 카드 맨 아래의 대회 상세 바로가기 */
export function GroupContestCardLink({
  contest,
  children,
}: {
  contest: Pick<GroupContestCardFragment, 'id' | 'groupId'>;
  children: ReactNode;
}) {
  return (
    <Link
      href={ROUTES.GROUP_CONTEST(contest.groupId, contest.id)}
      className="mt-auto min-h-touch content-center text-label text-ink underline underline-offset-4"
    >
      {children}
    </Link>
  );
}
