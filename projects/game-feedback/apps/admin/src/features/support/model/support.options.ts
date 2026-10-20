import { queryOptions, infiniteQueryOptions } from '@tanstack/react-query';
import { fetchThreads, fetchMessages } from '../api/support.api';
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
