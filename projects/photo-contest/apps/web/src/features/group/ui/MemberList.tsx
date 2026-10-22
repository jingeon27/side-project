import { GroupRole, type GroupQuery } from '@/shared/api/generated';
import { Avatar } from '@/shared/ui/@core/avatar';
import { Badge } from '@/shared/ui/@core/badge';

import { canRemoveMember, isGroupOwner } from '../lib/group.helper';
import { MemberRoleActions } from './MemberRoleActions';
import { RemoveMemberButton } from './RemoveMemberButton';

interface IMemberListProps {
  members: GroupQuery['group']['members'];
  /** 지금 보는 사람. "나" 표시를 붙인다. */
  viewerId?: string;
  groupId?: string;
  viewerRole?: GroupRole | null;
}

/** 그룹 멤버 목록. 관리자를 먼저 보여 준다. */
export function MemberList({ members, viewerId, groupId, viewerRole }: IMemberListProps) {
  const sorted = [...members].sort((a, b) => Number(isGroupOwner(b.role)) - Number(isGroupOwner(a.role)));
  return (
    <ul className="flex flex-col divide-y divide-line">
      {sorted.map((member) => (
        <li key={member.user.id} className="flex min-h-14 flex-wrap items-center gap-3 py-3">
          <Avatar name={member.user.nickname} src={member.user.avatar} size="sm" />
          <span className="line-clamp-1 min-w-0 flex-1 text-body text-ink">
            {member.user.nickname}
            {member.user.id === viewerId ? <span className="text-muted"> (나)</span> : null}
          </span>
          {isGroupOwner(member.role) ? <Badge tone="brand">관리자</Badge> : null}
          {member.role === GroupRole.Moderator ? <Badge>부관리자</Badge> : null}
          {groupId && isGroupOwner(viewerRole) && !isGroupOwner(member.role) ? (
            <MemberRoleActions
              groupId={groupId}
              userId={member.user.id}
              nickname={member.user.nickname}
              role={member.role}
            />
          ) : null}
          {groupId && member.user.id !== viewerId && canRemoveMember(viewerRole, member.role) ? (
            <RemoveMemberButton groupId={groupId} userId={member.user.id} nickname={member.user.nickname} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
