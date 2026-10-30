import Link from 'next/link';

import { ArrowUpRight, Users } from 'lucide-react';

import type { GroupCardFragment } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { formatCount } from '@/shared/lib/format.helper';
import { Avatar } from '@/shared/ui/@core/avatar';
import { Badge } from '@/shared/ui/@core/badge';

import { isGroupOwner } from '../../lib/group.helper';

interface IGroupCardProps {
  group: GroupCardFragment;
}

/** 마이페이지의 내 그룹 카드. 카드 전체가 그룹 화면 링크다. */
export function GroupCard({ group }: IGroupCardProps) {
  return (
    <Link
      href={ROUTES.GROUP(group.id)}
      className="group flex items-center gap-3 rounded-card border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-sunken active:bg-neutral-soft"
    >
      <Avatar
        name={group.name}
        src={group.avatarUrl}
        size="lg"
        className="size-12 rounded-card border border-line bg-accent-soft text-accent-ink"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-subtitle text-ink">{group.name}</span>
          {isGroupOwner(group.role) ? (
            <Badge tone="brand" className="shrink-0">
              관리자
            </Badge>
          ) : null}
        </span>
        <span className="flex items-center gap-1 text-caption text-muted">
          <Users aria-hidden className="size-3.5" />
          멤버 {formatCount(group.memberCount)}명
        </span>
        {group.description ? (
          <span className="line-clamp-1 text-caption text-muted">{group.description}</span>
        ) : null}
      </span>
      <ArrowUpRight aria-hidden className="size-4 shrink-0 text-subtle group-hover:text-accent-ink" />
    </Link>
  );
}
