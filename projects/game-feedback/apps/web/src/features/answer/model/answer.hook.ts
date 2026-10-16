'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postDetailOptions, postListOptions } from '@/features/post';
import { notificationListOptions } from '@/features/notification';
import { deleteAnswerById, patchAnswer, postAnswer, postHelpfulAnswer } from '../api/answer.api';
function useRefreshAnswerCaches() {
  const client = useQueryClient();
  return async (postId: string) => {
    await Promise.all([
      client.invalidateQueries(postDetailOptions(postId)),
      client.invalidateQueries(postListOptions()),
      client.invalidateQueries(notificationListOptions()),
    ]);
  };
}
export function useCreateAnswerMutation() {
  const refresh = useRefreshAnswerCaches();
  return useMutation({
    mutationFn: postAnswer,
    onSuccess: async (answer) => {
      await refresh(answer.postId);
    },
  });
}
export function useUpdateAnswerMutation() {
  const refresh = useRefreshAnswerCaches();
  return useMutation({
    mutationFn: patchAnswer,
    onSuccess: async (answer) => {
      await refresh(answer.postId);
    },
  });
}
export function useDeleteAnswerMutation() {
  const refresh = useRefreshAnswerCaches();
  return useMutation({
    mutationFn: deleteAnswerById,
    onSuccess: async (_, { postId }) => {
      await refresh(postId);
    },
  });
}
export function useHelpfulAnswerMutation() {
  const refresh = useRefreshAnswerCaches();
  return useMutation({
    mutationFn: postHelpfulAnswer,
    onSuccess: async (answer) => {
      await refresh(answer.postId);
    },
  });
}
