import { ChevronRight, Users } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import type { GroupCardFragment } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { formatCount } from '@/shared/lib/format.helper';
import { Badge } from '@/shared/ui/@core/badge';

import { isGroupOwner } from '../lib/group.helper';

interface IGroupCardProps {
  group: GroupCardFragment;
  /** 최근 대회 줄(단계 배지 + 제목). 화면이 대회 기능으로 채운다. */
  latestContest?: ReactNode;
}

/** 홈의 내 그룹 카드. 카드 전체가 그룹 화면 링크다. */
export function GroupCard({ group, latestContest }: IGroupCardProps) {
  return (
    <Link
      href={ROUTES.GROUP(group.id)}
      className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card transition-colors hover:bg-sunken active:bg-sunken"
    >
      <span
        aria-hidden
        className="flex size-12 shrink-0 items-center justify-center rounded-control bg-brand-soft text-title text-brand-strong"
      >
        {Array.from(group.name.trim())[0] ?? '?'}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className="line-clamp-1 text-subtitle text-ink">{group.name}</span>
          {isGroupOwner(group.role) ? <Badge tone="brand">관리자</Badge> : null}
        </span>
        <span className="flex items-center gap-1 text-caption text-muted">
          <Users aria-hidden className="size-3.5" />
          {formatCount(group.members.length)}명의 친구
        </span>
        {latestContest ?? <span className="text-caption text-muted">첫 대회를 기다리고 있어요</span>}
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-subtle" />
    </Link>
  );
}
