import { followUser, getUserFollow, unfollowUser } from '@game-feedback/sdk';
import type { TFollowStatus } from '@game-feedback/contracts';
import { withApiError } from '@/shared/api';

export function fetchFollowStatus(userId: string, signal?: AbortSignal) {
  return withApiError(getUserFollow(userId, { signal }));
}

export async function updateFollow({
  userId,
  following,
  notifyNewPosts,
}: { userId: string } & TFollowStatus): Promise<TFollowStatus> {
  if (following) return withApiError(followUser(userId, { notifyNewPosts }));
  await withApiError(unfollowUser(userId));
  return { following: false, notifyNewPosts: false };
}
