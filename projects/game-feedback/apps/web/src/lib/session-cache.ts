import type { QueryClient } from '@tanstack/react-query';
import type { Session } from '@game-feedback/contracts';
export async function replaceSession(client: QueryClient, session: Session) {
  await client.cancelQueries();
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
  client.setQueryData(['session'], session);
}
