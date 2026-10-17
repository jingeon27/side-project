import { queryOptions, skipToken } from '@tanstack/react-query';
import { compact } from 'es-toolkit';
import { fetchFollowStatus } from '../api/follow.api';

function followScope(viewerId?: string, userId?: string) {
  return queryOptions({ queryKey: compact(['user-follow', viewerId, userId]), queryFn: skipToken });
}
function createFollowStatusOptions(viewerId: string, userId: string) {
  return queryOptions({
    queryKey: followScope(viewerId, userId).queryKey,
    queryFn: ({ signal }) => fetchFollowStatus(userId, signal),
    staleTime: 0,
  });
}
export function followStatusOptions(
  viewerId: string,
  userId: string,
): ReturnType<typeof createFollowStatusOptions>;
export function followStatusOptions(
  viewerId?: string,
  userId?: string,
): ReturnType<typeof createFollowStatusOptions> | ReturnType<typeof followScope>;
export function followStatusOptions(viewerId?: string, userId?: string) {
  return viewerId && userId ? createFollowStatusOptions(viewerId, userId) : followScope(viewerId, userId);
}
