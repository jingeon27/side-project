import type { ApolloCache } from '@apollo/client';

import { MyGroupsDocument, type GroupCardFragment } from '@/shared/api/generated';

/**
 * 새로 만들거나 가입한 그룹을 홈 목록 맨 앞에 넣는다. 홈 목록을 아직 불러오지 않았으면 그대로 둔다(홈에 가면 받아 온다).
 * 같은 그룹이 이미 있으면 한 번만 남긴다.
 */
/** 나간 그룹을 홈 목록에서 뺀다. */
export function removeMyGroup(cache: ApolloCache, groupId: string) {
  cache.updateQuery({ query: MyGroupsDocument }, (data) =>
    data ? { myGroups: data.myGroups.filter((item) => item.id !== groupId) } : undefined,
  );
}

export function prependMyGroup(cache: ApolloCache, group: GroupCardFragment) {
  if (!group.role) return;
  cache.updateQuery({ query: MyGroupsDocument }, (data) =>
    data ? { myGroups: [group, ...data.myGroups.filter((item) => item.id !== group.id)] } : undefined,
  );
}
