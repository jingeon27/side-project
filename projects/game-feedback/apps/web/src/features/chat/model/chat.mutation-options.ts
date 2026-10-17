import { mutationOptions, type QueryClient } from '@tanstack/react-query';
import { markConversationRead, postChatMessage, startConversation } from '../api/chat.api';
import { chatMessageOptions, conversationScopeOptions } from './chat.options';
import type { IChatMessageInput } from './chat.types';

export function createConversationMutationOptions(client: QueryClient, userId?: string) {
  return mutationOptions({
    mutationKey: ['chat', userId, 'create-conversation'],
    mutationFn: startConversation,
    onSuccess: () => client.invalidateQueries(conversationScopeOptions(userId)),
  });
}

export function sendChatMessageMutationOptions(client: QueryClient, userId: string, conversationId: string) {
  return mutationOptions({
    mutationKey: ['chat', userId, conversationId, 'send-message'],
    mutationFn: (input: IChatMessageInput) => postChatMessage(conversationId, input),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries(chatMessageOptions(userId, conversationId)),
        client.invalidateQueries(conversationScopeOptions(userId)),
      ]),
  });
}

export function readConversationMutationOptions(client: QueryClient, userId: string, conversationId: string) {
  return mutationOptions({
    mutationKey: ['chat', userId, conversationId, 'read-conversation'],
    mutationFn: (messageId: string) => markConversationRead(conversationId, messageId),
    onSuccess: () => client.invalidateQueries(conversationScopeOptions(userId)),
  });
}
