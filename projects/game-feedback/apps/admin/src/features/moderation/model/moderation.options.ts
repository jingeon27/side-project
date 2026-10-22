import { infiniteQueryOptions, queryOptions, skipToken } from '@tanstack/react-query';

import type { TReportStatus } from '@game-feedback/contracts';

import { fetchReports, fetchUser } from '../api/moderation.api';

/** Every status list shares this prefix so a review or visibility change refreshes all of them. */
export function reportScopeOptions() {
  return queryOptions({ queryKey: ['admin-reports'], queryFn: skipToken });
}
export function reportOptions(status: TReportStatus) {
  return infiniteQueryOptions({
    queryKey: [...reportScopeOptions().queryKey, status],
    queryFn: ({ pageParam }) => fetchReports(status, pageParam),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}
export function userOptions(id: string) {
  return queryOptions({
    queryKey: ['admin-user', id],
    queryFn: () => fetchUser(id),
  });
}
