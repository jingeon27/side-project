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

export async function refreshSession(client: QueryClient, loadSession: () => Promise<Session>) {
  const options = sessionOptions();
  const previous = client.getQueryData(options.queryKey);
  const session = await loadSession();
  // Login/logout completed while the resume request was in flight.
  if (client.getQueryData(options.queryKey) !== previous) return;
  if (previous?.user?.id !== session.user?.id || previous?.needsOnboarding !== session.needsOnboarding) {
    await replaceSession(client, session);
    await client.invalidateQueries();
    return;
  }
  client.setQueryData(options.queryKey, session);
  await client.invalidateQueries();
}
