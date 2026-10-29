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

interface IReadPostInput {
  id: string;
  /** 요청할 때 읽지 않은 답변 id 묶음. 호출부가 같은 묶음을 다시 보내지 않도록 mutation 변수로 비교한다. */
  unreadAnswerIds: string;
}
export function readPostMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['post', 'read-post'],
    mutationFn: ({ id }: IReadPostInput) => postPostRead({ id }),
    onSuccess: async (_, { id }) => {
      await Promise.all([
        client.invalidateQueries(postDetailOptions(id)),
        client.invalidateQueries(notificationListOptions()),
      ]);
    },
  });
}
