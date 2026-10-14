import type { GroupQuery } from '@/shared/api/generated';
import { Avatar } from '@/shared/ui/@core/avatar';
import { Badge } from '@/shared/ui/@core/badge';

import { isGroupOwner } from '../lib/group.helper';

interface IMemberListProps {
  members: GroupQuery['group']['members'];
  /** 지금 보는 사람. "나" 표시를 붙인다. */
  viewerId?: string;
}

/** 그룹 멤버 목록. 관리자를 먼저 보여 준다. */
export function MemberList({ members, viewerId }: IMemberListProps) {
  const sorted = [...members].sort((a, b) => Number(isGroupOwner(b.role)) - Number(isGroupOwner(a.role)));
  return (
    <ul className="flex flex-col divide-y divide-line">
      {sorted.map((member) => (
        <li key={member.user.id} className="flex min-h-14 items-center gap-3 py-2">
          <Avatar name={member.user.nickname} src={member.user.avatar} size="sm" />
          <span className="line-clamp-1 min-w-0 flex-1 text-body text-ink">
            {member.user.nickname}
            {member.user.id === viewerId ? <span className="text-muted"> (나)</span> : null}
          </span>
          {isGroupOwner(member.role) ? <Badge tone="brand">관리자</Badge> : null}
        </li>
      ))}
    </ul>
  );
}
