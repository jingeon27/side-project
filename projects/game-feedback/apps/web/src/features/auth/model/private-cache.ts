import type { QueryClient, QueryKey } from '@tanstack/react-query';

export async function clearSessionDependentQueries(client: QueryClient, sessionKey: QueryKey) {
  const predicate = (query: { queryKey: QueryKey }) => query.queryKey[0] !== sessionKey[0];
  await client.cancelQueries({ predicate });
  client.removeQueries({ predicate });
}
