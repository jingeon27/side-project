import type { z } from 'zod';

import { UpdateProfileInputSchema } from '@game-feedback/contracts';
import { getPublicProfile, listBlocks, unblockUser, updateProfile } from '@game-feedback/sdk';

import { withApiError, type Author } from '@/shared/api';

export function fetchBlockedUsers({ signal }: { signal?: AbortSignal } = {}): Promise<Author[]> {
  return withApiError(listBlocks({ signal }));
}
export function deleteUserBlock({ userId }: { userId: string }) {
  return withApiError(unblockUser(userId));
}

export function fetchPublicProfile(id: string) {
  return withApiError(getPublicProfile(id));
}
export function patchProfile(input: z.infer<typeof UpdateProfileInputSchema>) {
  return withApiError(updateProfile(input));
}
