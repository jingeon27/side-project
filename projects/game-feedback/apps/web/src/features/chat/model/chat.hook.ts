import { useMutation, useQueryClient } from '@tanstack/react-query';
import { markConversationRead, postChatMessage, startConversation } from '../api/chat.api';
import { chatMessageOptions, conversationScopeOptions } from './chat.options';
import type { IChatMessageInput } from './chat.types';

export function useCreateConversationMutation(userId?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: startConversation,
    onSuccess: () => client.invalidateQueries(conversationScopeOptions(userId)),
  });
}

export function useSendChatMessageMutation(userId: string, conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: IChatMessageInput) => postChatMessage(conversationId, input),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries(chatMessageOptions(userId, conversationId)),
        client.invalidateQueries(conversationScopeOptions(userId)),
      ]),
  });
}

export function useReadConversationMutation(userId: string, conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => markConversationRead(conversationId, messageId),
    onSuccess: () => client.invalidateQueries(conversationScopeOptions(userId)),
  });
}
