import { infiniteQueryOptions, queryOptions, skipToken } from '@tanstack/react-query';
import { ApiError } from '@/shared/api';
import { fetchChatMessages, fetchConversations } from '../api/chat.api';

export function chatScopeOptions(userId?: string) {
  return { queryKey: userId ? (['chat', userId] as const) : (['chat'] as const) };
}

export function conversationScopeOptions(userId?: string) {
  return { queryKey: [...chatScopeOptions(userId).queryKey, 'conversations'] as const };
}

export function chatMessageScopeOptions(userId?: string) {
  return { queryKey: [...chatScopeOptions(userId).queryKey, 'messages'] as const };
}

export function conversationListOptions(userId: string) {
  return infiniteQueryOptions({
    queryKey: [...conversationScopeOptions(userId).queryKey, 'list'] as const,
    queryFn: ({ pageParam }) => fetchConversations(pageParam),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor || undefined,
    staleTime: 0,
  });
}

export function conversationBadgeOptions(userId?: string) {
  return queryOptions({
    queryKey: [...conversationScopeOptions(userId).queryKey, 'badge'] as const,
    queryFn: userId ? () => fetchConversations('', 1) : skipToken,
    enabled: Boolean(userId),
    staleTime: 0,
  });
}

export function chatMessageOptions(userId: string, conversationId: string) {
  return infiniteQueryOptions({
    queryKey: [...chatMessageScopeOptions(userId).queryKey, conversationId] as const,
    queryFn: ({ pageParam }) => fetchChatMessages(conversationId, pageParam),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor || undefined,
    staleTime: 0,
    retry: (count, error) =>
      !(error instanceof ApiError && [401, 403, 404].includes(error.status)) && count < 1,
  });
}
