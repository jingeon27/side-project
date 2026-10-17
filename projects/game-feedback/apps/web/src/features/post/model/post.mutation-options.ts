import { mutationOptions, type QueryClient } from '@tanstack/react-query';
import { notificationListOptions } from '@/features/notification';
import { deletePostById, patchPost, postPost, postPostRead } from '../api/post.api';
import { postDetailOptions, postListOptions } from './post.options';

export function createPostMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['post', 'create-post'],
    mutationFn: postPost,
    onSuccess: async (post) => {
      await Promise.all([
        client.invalidateQueries(postListOptions()),
        client.invalidateQueries(postDetailOptions(post.id)),
      ]);
    },
  });
}

export function updatePostMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['post', 'update-post'],
    mutationFn: patchPost,
    onSuccess: async (post) => {
      await Promise.all([
        client.invalidateQueries(postListOptions()),
        client.invalidateQueries(postDetailOptions(post.id)),
      ]);
    },
  });
}

export function deletePostMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['post', 'delete-post'],
    mutationFn: deletePostById,
    onSuccess: async (_, { id }) => {
      await Promise.all([
        client.invalidateQueries(postListOptions()),
        client.invalidateQueries(postDetailOptions(id)),
        client.invalidateQueries(notificationListOptions()),
      ]);
    },
  });
}

export function readPostMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['post', 'read-post'],
    mutationFn: postPostRead,
    onSuccess: async (_, { id }) => {
      await Promise.all([
        client.invalidateQueries(postDetailOptions(id)),
        client.invalidateQueries(notificationListOptions()),
      ]);
    },
  });
}
