import { queryOptions, mutationOptions, type QueryClient } from '@tanstack/react-query';
import { fetchSession, loginLocalAdmin, endSession } from '../api/auth.api';
export function sessionOptions() {
  return queryOptions({ queryKey: ['admin-session'], queryFn: fetchSession, retry: false });
}
export function loginMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['admin-login'],
    mutationFn: loginLocalAdmin,
    onSuccess: async (session) => {
      await client.cancelQueries();
      client.clear();
      client.setQueryData(sessionOptions().queryKey, session);
    },
  });
}
export function logoutMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['admin-logout'],
    mutationFn: endSession,
    onSuccess: async (session) => {
      await client.cancelQueries();
      client.clear();
      client.setQueryData(sessionOptions().queryKey, session);
    },
  });
}
