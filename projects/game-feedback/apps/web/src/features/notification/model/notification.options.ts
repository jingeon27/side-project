import { infiniteQueryOptions, queryOptions, skipToken } from '@tanstack/react-query';
import { compact } from 'es-toolkit';
import { fetchNotificationList } from '../api/notification.api';
import type { TNotificationListParams } from '../types/notification.type';
function notificationListScope(userId?: string, params?: TNotificationListParams) {
  return queryOptions({ queryKey: compact(['fetchNotificationList', userId, params]), queryFn: skipToken });
}
function createNotificationListOptions(userId: string, params: TNotificationListParams) {
  return infiniteQueryOptions({
    queryKey: notificationListScope(userId, params).queryKey,
    queryFn: ({ pageParam }) =>
      fetchNotificationList({ ...params, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
export function notificationListOptions(
  userId: string,
  params: TNotificationListParams,
): ReturnType<typeof createNotificationListOptions>;
export function notificationListOptions(
  userId?: string,
  params?: TNotificationListParams,
): ReturnType<typeof createNotificationListOptions> | ReturnType<typeof notificationListScope>;
export function notificationListOptions(userId?: string, params?: TNotificationListParams) {
  return userId && params
    ? createNotificationListOptions(userId, params)
    : notificationListScope(userId, params);
}
export function notificationSummaryOptions(userId?: string) {
  return queryOptions({
    queryKey: [...notificationListOptions(userId).queryKey, 'summary'],
    queryFn: userId ? () => fetchNotificationList({ limit: 1 }) : skipToken,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
