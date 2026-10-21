import { mutationOptions, type QueryClient } from '@tanstack/react-query';

import { chatScopeOptions } from '@/features/chat';
import { followStatusOptions } from '@/features/follow';
import { notificationListOptions } from '@/features/notification';
import { postDetailOptions, postListOptions } from '@/features/post';
import { blockListOptions } from '@/features/user';

import { postBlockUser, postReport } from '../api/moderation.api';

export function blockUserMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['moderation', 'block-user'],
    mutationFn: postBlockUser,
    onSuccess: () => {
      // Complete the confirmed block immediately; query boundaries own refresh failures.
      void Promise.all([
        client.invalidateQueries(blockListOptions()),
        client.invalidateQueries(postListOptions()),
        client.invalidateQueries(postDetailOptions()),
        client.invalidateQueries(notificationListOptions()),
        client.invalidateQueries(chatScopeOptions()),
        client.invalidateQueries(followStatusOptions()),
      ]).catch(() => undefined);
    },
  });
}

export function reportMutationOptions() {
  return mutationOptions({
    mutationKey: ['moderation', 'report'],
    mutationFn: postReport,
  });
}
