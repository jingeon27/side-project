import { ChevronRight, Users } from 'lucide-react';
import Link from 'next/link';

import type { GroupCardFragment } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { formatCount } from '@/shared/lib/format.helper';
import { Badge } from '@/shared/ui/@core/badge';

import { isGroupOwner } from '../lib/group.helper';

interface IGroupCardProps {
  group: GroupCardFragment;
}

/** 마이페이지의 내 그룹 카드. 카드 전체가 그룹 화면 링크다. */
export function GroupCard({ group }: IGroupCardProps) {
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
        <span className="text-caption text-muted">사진·동영상으로 나누는 웃긴 순간</span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-subtle" />
    </Link>
  );
}
