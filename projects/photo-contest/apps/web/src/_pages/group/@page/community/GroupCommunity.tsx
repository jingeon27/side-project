'use client';

import { useReadQuery } from '@apollo/client/react';

import { canLeaveGroup, LeaveGroupButton, MemberList } from '@/features/group';

import type { TGroupQueryRef } from '../model/group-query.type';

export function GroupCommunity({ groupRef, viewerId }: { groupRef: TGroupQueryRef; viewerId: string }) {
  const { data } = useReadQuery(groupRef);
  if (!data) return null;
  const { group } = data;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-title text-ink">함께하는 친구 {group.memberCount}명</h2>
      <MemberList groupId={group.id} viewerRole={group.role} members={group.members} viewerId={viewerId} />
      {canLeaveGroup(group.role) ? (
        <div className="flex justify-end">
          <LeaveGroupButton groupId={group.id} groupName={group.name} visibility={group.visibility} />
        </div>
      ) : null}
    </section>
  );
}
