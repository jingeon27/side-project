import { queryOptions } from '@tanstack/react-query';

import { fetchReports, fetchUser } from '../api/moderation.api';

export function reportOptions() {
  return queryOptions({ queryKey: ['admin-reports'], queryFn: fetchReports });
}
export function userOptions(id: string) {
  return queryOptions({
    queryKey: ['admin-user', id],
    queryFn: () => fetchUser(id),
  });
}
