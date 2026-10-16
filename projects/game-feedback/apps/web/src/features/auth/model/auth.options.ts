import { queryOptions, skipToken } from '@tanstack/react-query';
import { fetchSession, fetchTestAccounts } from '../api/auth.api';
import type { Session } from '@/shared/api';
import { clearSessionDependentQueries } from './private-cache';

export function sessionOptions() {
  return queryOptions({
    queryKey: ['session'],
    queryFn: async ({ signal, client, queryKey }): Promise<Session> => {
      const previous = client.getQueryData<Session>(queryKey);
      const next = await fetchSession({ signal });
      const current = client.getQueryData<Session>(queryKey);
      if (current && current !== previous) return current;
      if (previous?.user?.id !== next.user?.id || previous?.needsOnboarding !== next.needsOnboarding) {
        await clearSessionDependentQueries(client, queryKey);
      }
      // A login/logout may finish while cancellation is settling.
      const latest = client.getQueryData<Session>(queryKey);
      if (latest && latest !== previous) return latest;
      return next;
    },
  });
}
export function testAccountListOptions(demoMode = true) {
  return queryOptions({
    queryKey: ['test-accounts'],
    queryFn: demoMode ? ({ signal }) => fetchTestAccounts({ signal }) : skipToken,
    retry: false,
  });
}
