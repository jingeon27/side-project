'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chatScopeOptions } from '@/features/chat';
import { postListOptions, postDetailOptions } from '@/features/post';
import { useNotify } from '@/shared/ui';
import { deleteUserBlock } from '../api/user.api';
import { blockListOptions } from './user.options';

export function useUnblockUser() {
  const client = useQueryClient();
  const notify = useNotify();
  return useMutation({
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
