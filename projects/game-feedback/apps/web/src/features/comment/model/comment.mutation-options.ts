import { mutationOptions, type QueryClient } from '@tanstack/react-query';

import { notificationListOptions } from '@/features/notification';
import { postDetailOptions, postListOptions, refreshServerPostDetail } from '@/features/post';

import { deleteCommentById, patchComment, postComment } from '../api/comment.api';

function createRefreshCommentCaches(client: QueryClient) {
  return async (postId: string) => {
    await Promise.all([
      client.invalidateQueries(postDetailOptions(postId)),
      client.invalidateQueries(postListOptions()),
      client.invalidateQueries(notificationListOptions()),
      refreshServerPostDetail(postId),
    ]);
  };
}

export function createCommentMutationOptions(client: QueryClient) {
  const refresh = createRefreshCommentCaches(client);
  return mutationOptions({
    mutationKey: ['comment', 'create-comment'],
    mutationFn: postComment,
    onSuccess: async (comment) => {
      await refresh(comment.postId);
    },
  });
}

export function updateCommentMutationOptions(client: QueryClient) {
  const refresh = createRefreshCommentCaches(client);
  return mutationOptions({
    mutationKey: ['comment', 'update-comment'],
    mutationFn: patchComment,
    onSuccess: async (comment) => {
      await refresh(comment.postId);
    },
  });
}

export function deleteCommentMutationOptions(client: QueryClient) {
  const refresh = createRefreshCommentCaches(client);
  return mutationOptions({
    mutationKey: ['comment', 'delete-comment'],
    mutationFn: deleteCommentById,
    onSuccess: async (_, { postId }) => {
      await refresh(postId);
    },
  });
}
