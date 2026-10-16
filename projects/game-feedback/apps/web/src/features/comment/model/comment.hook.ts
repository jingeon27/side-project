'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postDetailOptions, postListOptions } from '@/features/post';
import { notificationListOptions } from '@/features/notification';
import { deleteCommentById, patchComment, postComment } from '../api/comment.api';
function useRefreshCommentCaches() {
  const client = useQueryClient();
  return async (postId: string) => {
    await Promise.all([
      client.invalidateQueries(postDetailOptions(postId)),
      client.invalidateQueries(postListOptions()),
      client.invalidateQueries(notificationListOptions()),
    ]);
  };
}
export function useCreateCommentMutation() {
  const refresh = useRefreshCommentCaches();
  return useMutation({
    mutationFn: postComment,
    onSuccess: async (comment) => {
      await refresh(comment.postId);
    },
  });
}
export function useUpdateCommentMutation() {
  const refresh = useRefreshCommentCaches();
  return useMutation({
    mutationFn: patchComment,
    onSuccess: async (comment) => {
      await refresh(comment.postId);
    },
  });
}
export function useDeleteCommentMutation() {
  const refresh = useRefreshCommentCaches();
  return useMutation({
    mutationFn: deleteCommentById,
    onSuccess: async (_, { postId }) => {
      await refresh(postId);
    },
  });
}
