import Link from 'next/link';

import { ArrowUpRight, Users } from 'lucide-react';

import type { GroupCardFragment } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { formatCount } from '@/shared/lib/format.helper';
import { Avatar } from '@/shared/ui/@core/avatar';
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
      className="flex items-center gap-4 rounded-control border border-line bg-surface p-5 transition-colors hover:bg-sunken active:bg-neutral-soft"
    >
      <Avatar
        name={group.name}
        src={group.avatarUrl}
        size="lg"
        className="size-14 border border-line bg-sunken text-ink"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className="line-clamp-1 text-subtitle text-ink">{group.name}</span>
          {isGroupOwner(group.role) ? <Badge tone="brand">관리자</Badge> : null}
        </span>
        <span className="flex items-center gap-1 text-caption text-muted">
          <Users aria-hidden className="size-3.5" />
          {formatCount(group.members.length)}명의 친구
        </span>
        <span className="line-clamp-2 text-caption text-muted">
          {group.description || '사진·동영상으로 나누는 웃긴 순간'}
        </span>
      </span>
      <ArrowUpRight aria-hidden className="size-5 shrink-0 text-subtle" />
    </Link>
  );
}
