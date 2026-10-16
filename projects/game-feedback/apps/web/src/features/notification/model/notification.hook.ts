'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postReadNotification } from '../api/notification.api';
import { notificationListOptions } from './notification.options';
export function useReadNotificationMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: postReadNotification,
    onSuccess: async () => {
      await client.invalidateQueries(notificationListOptions());
    },
  });
}
