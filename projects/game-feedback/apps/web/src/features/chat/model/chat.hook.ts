'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  createConversationMutationOptions,
  readConversationMutationOptions,
  sendChatMessageMutationOptions,
} from './chat.mutation-options';

export function useCreateConversationMutation(userId?: string) {
  const client = useQueryClient();
  return useMutation(createConversationMutationOptions(client, userId));
}

export function useSendChatMessageMutation(userId: string, conversationId: string) {
  const client = useQueryClient();
  return useMutation(sendChatMessageMutationOptions(client, userId, conversationId));
}

export function useReadConversationMutation(userId: string, conversationId: string) {
  const client = useQueryClient();
  return useMutation(readConversationMutationOptions(client, userId, conversationId));
}
