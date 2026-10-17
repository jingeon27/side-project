import { mutationOptions, type QueryClient } from '@tanstack/react-query';
import {
  markConversationRead,
  postChatMessage,
  startConversation,
  uploadAttachment,
  removeAttachment,
} from '../api/chat.api';
import { chatMessageOptions, conversationScopeOptions } from './chat.options';
import type { IChatMessageInput } from './chat.types';
import { ApiError } from '@/shared/api';

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
export function uploadChatAttachmentMutationOptions(userId: string, conversationId: string) {
  return mutationOptions({
    mutationKey: ['chat', userId, conversationId, 'upload-attachment'],
    mutationFn: (file: File) => uploadAttachment(conversationId, file),
  });
}
export function removeChatAttachmentMutationOptions(userId: string, conversationId: string) {
  return mutationOptions({
    mutationKey: ['chat', userId, conversationId, 'remove-attachment'],
    mutationFn: async (attachmentId: string) => {
      try {
        return await removeAttachment(conversationId, attachmentId);
      } catch (error) {
        if (error instanceof ApiError && error.errorCode === 'ATTACHMENT_NOT_FOUND') return { ok: true };
        throw error;
      }
    },
  });
}
