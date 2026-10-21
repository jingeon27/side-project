import { mutationOptions, type QueryClient } from '@tanstack/react-query';

import { sessionOptions } from '@/features/auth';
import { chatScopeOptions } from '@/features/chat';
import { postDetailOptions, postListOptions } from '@/features/post';

import { postGameAccount } from '../api/game-profile.api';
import { gameAccountListOptions, gameProfileOptions } from './game-profile.options';

export function saveGameAccountMutationOptions(client: QueryClient, notify: (text: string) => void) {
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
      notify('게임 프로필이 연결되었어요.');
    },
  });
}

export function lookupGameProfileMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['game-profile', 'lookup'],
    mutationFn: ({ playerTag }: { playerTag: string }) => client.fetchQuery(gameProfileOptions(playerTag)),
  });
}
