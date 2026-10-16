'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postDetailOptions, postListOptions } from '@/features/post';
import { notificationListOptions } from '@/features/notification';
import { blockListOptions } from '@/features/user';
import { chatScopeOptions } from '@/features/chat';
import { postBlockUser, postReport } from '../api/moderation.api';
export function useBlockUserMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: postBlockUser,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries(blockListOptions()),
        client.invalidateQueries(postListOptions()),
        client.invalidateQueries(postDetailOptions()),
        client.invalidateQueries(notificationListOptions()),
        client.invalidateQueries(chatScopeOptions()),
      ]);
    },
  });
}
export function useReportMutation() {
  return useMutation({ mutationFn: postReport });
}
