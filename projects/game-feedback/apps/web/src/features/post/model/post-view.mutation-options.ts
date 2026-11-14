import { mutationOptions, type QueryClient } from '@tanstack/react-query';

import type { PostDetail } from '@game-feedback/contracts';

import { postPostView } from '../api/post.api';
import { postDetailOptions } from './post.options';

export function recordPostViewMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['post', 'record-view'],
    mutationFn: postPostView,
    onSuccess: ({ viewCount }, { id }) => {
      client.setQueryData<PostDetail>(postDetailOptions(id).queryKey, (detail) =>
        detail ? { ...detail, post: { ...detail.post, viewCount } } : detail,
      );
    },
  });
}
