import { queryOptions, skipToken } from '@tanstack/react-query';
import { fetchSession, fetchTestAccounts } from '../api/auth.api';

export function sessionOptions() {
  return queryOptions({ queryKey: ['session'], queryFn: ({ signal }) => fetchSession({ signal }) });
}
export function testAccountListOptions(demoMode = true) {
  return queryOptions({
    queryKey: ['test-accounts'],
    queryFn: demoMode ? ({ signal }) => fetchTestAccounts({ signal }) : skipToken,
    retry: false,
  });
}
