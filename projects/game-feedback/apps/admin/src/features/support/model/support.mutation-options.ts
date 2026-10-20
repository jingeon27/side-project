import { mutationOptions, type QueryClient } from '@tanstack/react-query';
import { updateStatus, sendReply } from '../api/support.api';
import { threadOptions, messageOptions } from './support.options';

export function statusMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['admin-support-status'],
    mutationFn: updateStatus,
    onSuccess: () => client.invalidateQueries(threadOptions()),
  });
}

export function replyMutationOptions(client: QueryClient, conversationId: string) {
  return mutationOptions({
    mutationKey: ['admin-support-reply', conversationId],
    mutationFn: sendReply,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries(messageOptions(conversationId)),
        client.invalidateQueries(threadOptions()),
      ]),
  });
}
