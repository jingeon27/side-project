import { infiniteQueryOptions, queryOptions, skipToken } from '@tanstack/react-query';
import { compact } from 'es-toolkit';
import { fetchNotificationList } from '../api/notification.api';
import type { TNotificationListParams } from '../types/notification.type';
export function notificationListOptions(userId?: string, params?: TNotificationListParams) {
  return infiniteQueryOptions({
    queryKey: compact(['fetchNotificationList', userId, params]),
    queryFn:
      userId && params
        ? ({ pageParam }) => fetchNotificationList({ ...params, ...(pageParam ? { cursor: pageParam } : {}) })
        : skipToken,
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 15_000,
  });
}
export function notificationSummaryOptions(userId?: string) {
  return queryOptions({
    queryKey: [...notificationListOptions(userId).queryKey, 'summary'],
    queryFn: userId ? () => fetchNotificationList({ limit: 1 }) : skipToken,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
