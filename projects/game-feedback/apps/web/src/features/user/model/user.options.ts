import { queryOptions, skipToken } from '@tanstack/react-query';

import { fetchBlockedUsers, fetchPublicProfile } from '../api/user.api';

function blockListScope() {
  return queryOptions({ queryKey: ['blocks'], queryFn: skipToken });
}
function createBlockListOptions(userId: string) {
  return queryOptions({
    queryKey: [...blockListScope().queryKey, userId],
    queryFn: ({ signal }) => fetchBlockedUsers({ signal }),
  });
}
export function blockListOptions(userId: string): ReturnType<typeof createBlockListOptions>;
export function blockListOptions(
  userId?: string,
): ReturnType<typeof createBlockListOptions> | ReturnType<typeof blockListScope>;
export function blockListOptions(userId?: string) {
  return userId ? createBlockListOptions(userId) : blockListScope();
}

export function profileOptions(id: string) {
  return queryOptions({
    queryKey: ['public-profile', id],
    queryFn: () => fetchPublicProfile(id),
    staleTime: 0,
  });
}
