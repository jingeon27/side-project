import { mutationOptions, type QueryClient } from '@tanstack/react-query';

import { notificationListOptions } from '@/features/notification';
import { postDetailOptions, postListOptions } from '@/features/post';

import { deleteAnswerById, patchAnswer, postAnswer, postHelpfulAnswer } from '../api/answer.api';

function createRefreshAnswerCaches(client: QueryClient) {
  return async (postId: string) => {
    await Promise.all([
      client.invalidateQueries(postDetailOptions(postId)),
      client.invalidateQueries(postListOptions()),
      client.invalidateQueries(notificationListOptions()),
    ]);
  };
}

export function createAnswerMutationOptions(client: QueryClient) {
  const refresh = createRefreshAnswerCaches(client);
  return mutationOptions({
    mutationKey: ['answer', 'create-answer'],
    mutationFn: postAnswer,
    onSuccess: async (answer) => {
      await refresh(answer.postId);
    },
  });
}

export function updateAnswerMutationOptions(client: QueryClient) {
  const refresh = createRefreshAnswerCaches(client);
  return mutationOptions({
    mutationKey: ['answer', 'update-answer'],
    mutationFn: patchAnswer,
    onSuccess: async (answer) => {
      await refresh(answer.postId);
    },
  });
}

export function deleteAnswerMutationOptions(client: QueryClient) {
  const refresh = createRefreshAnswerCaches(client);
  return mutationOptions({
    mutationKey: ['answer', 'delete-answer'],
    mutationFn: deleteAnswerById,
    onSuccess: async (_, { postId }) => {
      await refresh(postId);
    },
  });
}

export function helpfulAnswerMutationOptions(client: QueryClient) {
  const refresh = createRefreshAnswerCaches(client);
  return mutationOptions({
    mutationKey: ['answer', 'helpful-answer'],
    mutationFn: postHelpfulAnswer,
    onSuccess: async (answer) => {
      await refresh(answer.postId);
    },
  });
}
