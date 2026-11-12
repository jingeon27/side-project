'use client';

import type { RefCallback } from 'react';

import { useQuery, useReadQuery } from '@apollo/client/react';

import { Disclosure, DisclosureTrigger } from '@side/design-system';

import { isGroupAdmin, isGroupOwner } from '@/features/group';
import { InviteCard } from '@/features/invite';
import { GroupVisibility, MeDocument } from '@/shared/api/generated';
import { useIsSSR } from '@/shared/model/is-ssr.hook';

import type { TGroupQueryRef } from '../model/group-query.type';
import { GroupCategoryManager } from './categories/GroupCategoryManager';
import { GroupCommunity } from './community/GroupCommunity';
import { HiddenPostManager } from './hidden-posts/HiddenPostManager';
import { GroupJoinRequests } from './join-requests/GroupJoinRequests';

export function GroupSidebar({
  groupRef,
  communityRef,
}: {
  groupRef: TGroupQueryRef;
  communityRef: RefCallback<HTMLDetailsElement>;
}) {
  const isSSR = useIsSSR();
  const { data } = useReadQuery(groupRef);
  const { data: viewer } = useQuery(MeDocument, { fetchPolicy: 'cache-only' });
  if (!data) return null;
  const { group } = data;
  if (!group.role || !group.inviteToken) return null;
  return (
    <div className="flex flex-col gap-5">
      <Disclosure
        ref={communityRef}
        id={`group-community-${group.id}`}
        inert={isSSR}
        variant="card"
        className="scroll-mt-24"
      >
        <DisclosureTrigger>초대와 그룹 멤버</DisclosureTrigger>
        <div className="mt-4 flex flex-col gap-6">
          <InviteCard
            groupId={group.id}
            groupName={group.name}
            inviteToken={group.inviteToken}
            canRegenerate={isGroupOwner(group.role)}
          />
          <GroupCommunity groupRef={groupRef} viewerId={viewer?.me?.id ?? ''} />
        </div>
      </Disclosure>
      {isGroupAdmin(group.role) ? (
        <>
          <GroupCategoryManager groupId={group.id} />
          <HiddenPostManager groupId={group.id} />
          {group.visibility === GroupVisibility.Private ? <GroupJoinRequests groupId={group.id} /> : null}
        </>
      ) : null}
    </div>
  );
}
