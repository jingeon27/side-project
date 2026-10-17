import { mutationOptions, type QueryClient } from '@tanstack/react-query';
import { recordPostView } from '@game-feedback/sdk';
import type { PostDetail } from '@game-feedback/contracts';
import { withApiError } from '@/shared/api';
import { postDetailOptions } from './post.options';

export function recordPostViewMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['post', 'record-view'],
    mutationFn: ({ id, visitorId }: { id: string; visitorId: string }) =>
      withApiError(recordPostView(id, { visitorId })),
    onSuccess: ({ viewCount }, { id }) => {
      client.setQueryData<PostDetail>(postDetailOptions(id).queryKey, (detail) =>
        detail ? { ...detail, post: { ...detail.post, viewCount } } : detail,
      );
    },
  });
}
