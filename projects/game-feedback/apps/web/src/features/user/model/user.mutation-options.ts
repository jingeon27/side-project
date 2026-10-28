import { mutationOptions, type QueryClient } from '@tanstack/react-query';

import { chatScopeOptions } from '@/features/chat';
import { postDetailOptions, postListOptions } from '@/features/post';

import { deleteUserBlock } from '../api/user.api';
import { blockListOptions } from './user.options';

/** `afterSuccess`는 캐시 갱신이 끝난 뒤 부른다(호출부의 번역한 알림 등). */
export function unblockUserMutationOptions(client: QueryClient, afterSuccess?: () => void) {
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
      afterSuccess?.();
    },
  });
}
