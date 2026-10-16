'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionOptions } from '@/features/auth';
import { chatScopeOptions } from '@/features/chat';
import { postListOptions, postDetailOptions } from '@/features/post';
import { useNotify } from '@/shared/ui';
import { postGameAccount } from '../api/game-profile.api';
import { gameAccountListOptions } from './game-profile.options';

export function useSaveGameAccount() {
  const client = useQueryClient();
  const notify = useNotify();
  return useMutation({
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
