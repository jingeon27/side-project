import {
  createConversation,
  listChatMessages,
  listConversations,
  readConversation,
  sendChatMessage,
  uploadChatAttachment,
  deleteChatAttachment,
} from '@game-feedback/sdk';
import type { IChatMessageInput } from '../model/chat.types';

export function fetchConversations(cursor = '', limit = 20) {
  return listConversations({ limit, ...(cursor ? { cursor } : {}) });
}

export function fetchChatMessages(conversationId: string, cursor = '') {
  return listChatMessages(conversationId, { limit: 30, ...(cursor ? { cursor } : {}) });
}

export function startConversation(recipientId: string) {
  return createConversation({ recipientId });
}

export function postChatMessage(conversationId: string, input: IChatMessageInput) {
  return sendChatMessage(conversationId, input);
}

export function markConversationRead(conversationId: string, messageId: string) {
  return readConversation(conversationId, { messageId });
}
export function uploadAttachment(conversationId: string, file: File) {
  return uploadChatAttachment(conversationId, { file });
}
export function removeAttachment(conversationId: string, attachmentId: string) {
  return deleteChatAttachment(conversationId, attachmentId, { keepalive: true });
}
