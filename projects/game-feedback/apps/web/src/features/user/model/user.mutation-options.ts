import { mutationOptions, type QueryClient } from '@tanstack/react-query';

import { chatScopeOptions } from '@/features/chat';
import { postDetailOptions, postListOptions } from '@/features/post';

import { deleteUserBlock } from '../api/user.api';
import { blockListOptions } from './user.options';

export function unblockUserMutationOptions(client: QueryClient, notify: (text: string) => void) {
  return mutationOptions({
    mutationKey: ['user', 'unblock-user'],
    mutationFn: deleteUserBlock,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries(blockListOptions()),
        client.invalidateQueries(postListOptions()),
        client.invalidateQueries(postDetailOptions()),
        client.invalidateQueries(chatScopeOptions()),
      ]);
      notify('차단을 해제했어요.');
    },
  });
}
