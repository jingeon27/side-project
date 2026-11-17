import { z } from 'zod';

import { materialCatalogSchema } from './materials';

export async function materialRequest<T>(url: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const data: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(data);
    throw new Error(error.success ? error.data.error : '참고 자료 요청을 처리하지 못했습니다.');
  }
  return schema.parse(data);
}
export const materialCatalogQuery = {
  queryKey: ['materials'],
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    materialRequest('/api/materials', materialCatalogSchema, { signal }),
};
