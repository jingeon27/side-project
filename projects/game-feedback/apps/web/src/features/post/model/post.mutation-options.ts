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
      // 지운 글을 다시 받으면 404가 화면의 오류 경계로 잠깐 보인다. 재조회 없이 캐시에서 뺀다.
      await client.cancelQueries(postDetailOptions(id));
      client.removeQueries(postDetailOptions(id));
      // 상세 화면에서 비활성인 목록은 표시만 하고, 이동한 화면이 마운트될 때 다시 받는다.
      await Promise.all([
        client.invalidateQueries(postListOptions()),
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
