import { listBlocks, unblockUser } from '@game-feedback/sdk';
import { withApiError, type Author } from '@/shared/api';

export function fetchBlockedUsers({ signal }: { signal?: AbortSignal } = {}): Promise<Author[]> {
  return withApiError(listBlocks({ signal }));
}
export function deleteUserBlock({ userId }: { userId: string }) {
  return withApiError(unblockUser(userId));
}
