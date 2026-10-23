import { infiniteQueryOptions, queryOptions, skipToken, type InfiniteData } from '@tanstack/react-query';
import { compact } from 'es-toolkit';

import type { TReportStatus } from '@game-feedback/contracts';

import { fetchReports, fetchUser } from '../api/moderation.api';

type TReportPage = Awaited<ReturnType<typeof fetchReports>>;
type TReportOptions = ReturnType<
  typeof infiniteQueryOptions<TReportPage, Error, InfiniteData<TReportPage>, string[], string>
>;

export function reportOptions(status: TReportStatus): TReportOptions & {
  queryFn: Exclude<TReportOptions['queryFn'], typeof skipToken>;
};
export function reportOptions(): TReportOptions;
export function reportOptions(status?: TReportStatus) {
  return infiniteQueryOptions({
    queryKey: compact(['admin-reports', status]),
    queryFn: status ? ({ pageParam }) => fetchReports(status, pageParam) : skipToken,
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
