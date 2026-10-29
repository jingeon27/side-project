import { mutationOptions, type QueryClient } from '@tanstack/react-query';

import { updateFollow } from '../api/follow.api';
import { followStatusOptions } from './follow.options';

export function updateFollowMutationOptions(client: QueryClient, viewerId: string) {
  return mutationOptions({
    mutationKey: ['user-follow', 'update', viewerId],
    mutationFn: updateFollow,
    onSuccess: (status, { userId }) => {
      client.setQueryData(followStatusOptions(viewerId, userId).queryKey, status);
    },
  });
}
