import { queryOptions, infiniteQueryOptions, mutationOptions, type QueryClient } from '@tanstack/react-query';
import { fetchThreads, fetchMessages, updateStatus, sendReply } from '../api/support.api';
export function threadOptions() {
  return queryOptions({ queryKey: ['admin-support'], queryFn: fetchThreads, refetchInterval: 10_000 });
}
export function messageOptions(id: string) {
  return infiniteQueryOptions({
    queryKey: ['admin-support-messages', id],
    queryFn: ({ pageParam }) => fetchMessages(id, pageParam),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: 5_000,
  });
}
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
