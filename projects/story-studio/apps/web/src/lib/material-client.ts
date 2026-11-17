import { z } from 'zod';

import { materialListSchema, materialOverviewSchema } from './materials';

export async function materialRequest<T>(url: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const data: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(data);
    throw new Error(error.success ? error.data.error : '참고 자료 요청을 처리하지 못했습니다.');
  }
  return schema.parse(data);
}
export function materialAction(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
// Collections and indexing state: small enough for every screen that only needs the collection names.
export const materialOverviewQuery = {
  queryKey: ['materials'],
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    materialRequest('/api/materials', materialOverviewSchema, { signal }),
};
export function materialListQuery(collection: string) {
  return {
    queryKey: ['materials', collection],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      materialRequest(`/api/materials?collection=${encodeURIComponent(collection)}`, materialListSchema, {
        signal,
      }),
  };
}
