'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { readNotificationMutationOptions } from './notification.mutation-options';

export function useReadNotificationMutation() {
  const client = useQueryClient();
  return useMutation(readNotificationMutationOptions(client));
}
