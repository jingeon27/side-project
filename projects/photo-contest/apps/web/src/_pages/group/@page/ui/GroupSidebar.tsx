'use client';

import { useQuery, useReadQuery } from '@apollo/client/react';

import { GroupCategoryManager, GroupJoinRequests, isGroupAdmin, isGroupOwner } from '@/features/group';
import { InviteCard } from '@/features/invite';
import { HiddenPostManager } from '@/features/post';
import { GroupVisibility, MeDocument } from '@/shared/api/generated';
import { useIsSSR } from '@/shared/model/is-ssr.hook';

import { GroupCommunity } from '../community/GroupCommunity';
import type { TGroupQueryRef } from '../model/group-query.type';

export function GroupSidebar({ groupRef }: { groupRef: TGroupQueryRef }) {
  const isSSR = useIsSSR();
  const { data } = useReadQuery(groupRef);
  const { data: viewer } = useQuery(MeDocument, { fetchPolicy: 'cache-only' });
  if (!data) return null;
  const { group } = data;
  if (!group.role || !group.inviteToken) return null;
  return (
    <div className="flex flex-col gap-5">
      <details inert={isSSR} className="rounded-card border border-line bg-surface p-4">
        <summary className="min-h-touch cursor-pointer content-center text-label text-ink">
          초대와 그룹 멤버
        </summary>
        <div className="mt-4 flex flex-col gap-6">
          <InviteCard
            groupId={group.id}
            groupName={group.name}
            inviteToken={group.inviteToken}
            canRegenerate={isGroupOwner(group.role)}
          />
          <GroupCommunity groupRef={groupRef} viewerId={viewer?.me?.id ?? ''} />
        </div>
      </details>
      {isGroupAdmin(group.role) ? <GroupCategoryManager groupId={group.id} /> : null}
      {isGroupAdmin(group.role) ? <HiddenPostManager groupId={group.id} /> : null}
      {isGroupAdmin(group.role) && group.visibility === GroupVisibility.Private ? (
        <GroupJoinRequests groupId={group.id} />
      ) : null}
    </div>
  );
}
