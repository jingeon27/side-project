import {
  clearChatHistory,
  completeChatAttachmentUpload,
  createConversation,
  deleteChatAttachment,
  listChatMessages,
  listConversations,
  readConversation,
  requestChatAttachmentUpload,
  sendChatMessage,
} from '@game-feedback/sdk';

import { uploadMediaFile } from '@/shared/api';

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
  return uploadMediaFile(file, {
    reserve: (input) => requestChatAttachmentUpload(conversationId, input),
    complete: (id) => completeChatAttachmentUpload(conversationId, id),
    remove: (id) => deleteChatAttachment(conversationId, id),
  });
}
export function removeAttachment(conversationId: string, attachmentId: string) {
  return deleteChatAttachment(conversationId, attachmentId, { keepalive: true });
}

export function clearHistory(conversationId: string, throughMessageId: string) {
  return clearChatHistory(conversationId, { throughMessageId });
}
