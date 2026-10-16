import type { QueryClient } from '@tanstack/react-query';
import type { Session } from '@/shared/api';
import { sessionOptions } from './auth.options';

export async function replaceSession(client: QueryClient, session: Session) {
  await client.cancelQueries();
  const options = sessionOptions();
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== options.queryKey[0] });
  client.setQueryData(options.queryKey, session);
}
export async function clearAuthenticatedSession(client: QueryClient) {
  const current = client.getQueryData(sessionOptions().queryKey);
  await replaceSession(client, {
    user: null,
    demoMode: current?.demoMode ?? false,
    googleConfigured: current?.googleConfigured ?? false,
    needsOnboarding: false,
  });
}
