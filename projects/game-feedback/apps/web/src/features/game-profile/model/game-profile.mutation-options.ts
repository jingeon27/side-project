import { mutationOptions, type QueryClient } from '@tanstack/react-query';

import { sessionOptions } from '@/features/auth';
import { chatScopeOptions } from '@/features/chat';
import { postDetailOptions, postListOptions } from '@/features/post';

import { postGameAccount } from '../api/game-profile.api';
import { gameAccountListOptions, gameProfileOptions } from './game-profile.options';

/** `afterSuccess`는 캐시 갱신이 끝난 뒤 부른다(호출부의 번역한 알림 등). */
export function saveGameAccountMutationOptions(client: QueryClient, afterSuccess?: () => void) {
  return mutationOptions({
    mutationKey: ['game-profile', 'save-game-account'],
    mutationFn: postGameAccount,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries(gameAccountListOptions()),
        client.invalidateQueries(sessionOptions()),
        client.invalidateQueries(postListOptions()),
        client.invalidateQueries(postDetailOptions()),
        client.invalidateQueries(chatScopeOptions()),
      ]);
      afterSuccess?.();
    },
  });
}

export function lookupGameProfileMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['game-profile', 'lookup'],
    mutationFn: ({ playerTag }: { playerTag: string }) => client.fetchQuery(gameProfileOptions(playerTag)),
  });
}
