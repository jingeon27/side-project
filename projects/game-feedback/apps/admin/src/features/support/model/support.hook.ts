import { useMutation, useQueryClient } from '@tanstack/react-query';
import { statusMutationOptions, replyMutationOptions } from './support.mutation-options';

export function useSupportStatusMutation() {
  const client = useQueryClient();
  return useMutation(statusMutationOptions(client));
}

export function useSupportReplyMutation(conversationId: string) {
  const client = useQueryClient();
  return useMutation(replyMutationOptions(client, conversationId));
}
