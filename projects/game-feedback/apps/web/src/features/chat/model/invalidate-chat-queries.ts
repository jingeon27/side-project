import type { QueryClient, QueryKey } from '@tanstack/react-query';

export async function invalidateChatQueries(client: QueryClient, scope: { queryKey: QueryKey }) {
  const cache = client.getQueryCache();
  const pagination = new Map(
    cache.findAll(scope).flatMap((query) => {
      const request =
        query.state.fetchStatus !== 'idle' && query.state.fetchMeta?.fetchMore ? query.promise : undefined;
      return request ? [[query, request] as const] : [];
    }),
  );
  if (pagination.size === 0) return client.invalidateQueries(scope);

  await Promise.all([
    client.invalidateQueries({ ...scope, predicate: (query) => !pagination.has(query) }),
    ...Array.from(pagination, async ([query, request]) => {
      // 여러 실시간 이벤트가 와도 페이지 조회가 끝난 뒤 갱신을 한 번 공유한다.
      await request.catch(() => undefined);
      if (cache.get(query.queryHash) !== query) return;
      await client.invalidateQueries({ queryKey: query.queryKey, exact: true }, { cancelRefetch: false });
    }),
  ]);
}
