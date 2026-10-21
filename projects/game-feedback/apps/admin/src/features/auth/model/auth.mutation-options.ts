import { mutationOptions, type QueryClient } from '@tanstack/react-query';

import { endSession, loginLocalAdmin } from '../api/auth.api';
import { sessionOptions } from './auth.options';

async function replaceSession(client: QueryClient, session: Awaited<ReturnType<typeof loginLocalAdmin>>) {
  await client.cancelQueries();
  const options = sessionOptions();
  const sessionQuery = client.getQueryCache().find({ queryKey: options.queryKey, exact: true });
  client.removeQueries({ predicate: (query) => query !== sessionQuery });
  client.getMutationCache().clear();
  // Keep the session observer attached when the login form unmounts.
  client.setQueryData(options.queryKey, session);
}

export function loginMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['admin-login'],
    mutationFn: loginLocalAdmin,
    onSuccess: (session) => replaceSession(client, session),
  });
}

export function logoutMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['admin-logout'],
    mutationFn: endSession,
    onSuccess: (session) => replaceSession(client, session),
  });
}
