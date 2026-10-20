'use client';

import type { TGroupQueryRef } from '../model/group-query.type';

import { useReadQuery } from '@apollo/client/react';

import { MemberList } from '@/features/group';

export function GroupCommunity({ groupRef, viewerId }: { groupRef: TGroupQueryRef; viewerId: string }) {
  const { data } = useReadQuery(groupRef);
  if (!data) return null;
  const { group } = data;
  return (
    <section>
      <h2 className="mb-3 text-title text-ink">함께하는 친구 {group.members.length}명</h2>
      <MemberList groupId={group.id} viewerRole={group.role} members={group.members} viewerId={viewerId} />
    </section>
  );
}
