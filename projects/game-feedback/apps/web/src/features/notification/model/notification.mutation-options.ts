import { mutationOptions, type QueryClient } from '@tanstack/react-query';

import { postReadNotification } from '../api/notification.api';
import { notificationListOptions } from './notification.options';

export function readNotificationMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['notification', 'read-notification'],
    mutationFn: postReadNotification,
    onSuccess: async () => {
      await client.invalidateQueries(notificationListOptions());
    },
  });
}
