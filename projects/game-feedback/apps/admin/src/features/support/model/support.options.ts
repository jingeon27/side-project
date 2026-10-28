import { infiniteQueryOptions, queryOptions, skipToken } from '@tanstack/react-query';

import type { TSupportStatus } from '@game-feedback/contracts';

import { fetchMessages, fetchThread, fetchThreads } from '../api/support.api';

type TThreadOptions = ReturnType<typeof createThreadOptions>;

function createThreadOptions(id: string) {
  return queryOptions({
    queryKey: ['admin-support', 'thread', id],
    queryFn: () => fetchThread(id),
    refetchInterval: 10_000,
  });
}
/** 인자가 없으면 목록·단건을 함께 갱신하는 문의함 prefix다. */
export function threadOptions(id: string): TThreadOptions;
export function threadOptions(): ReturnType<typeof supportScope>;
export function threadOptions(id?: string) {
  return id ? createThreadOptions(id) : supportScope();
}
function supportScope() {
  return queryOptions({ queryKey: ['admin-support'], queryFn: skipToken });
}
/** 최근 대화 순의 문의함. `ALL`이면 상태를 거르지 않는다. */
export function threadListOptions(status: TSupportStatus | 'ALL') {
  return infiniteQueryOptions({
    queryKey: [...supportScope().queryKey, 'list', status],
    queryFn: ({ pageParam }) => fetchThreads({ ...(status === 'ALL' ? {} : { status }), cursor: pageParam }),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: 10_000,
  });
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
