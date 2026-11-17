import { z } from 'zod';

import { voiceCatalogSchema, voiceDetailSchema } from '../model/voice-training';

export async function voiceRequest<T>(url: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const data: unknown = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(data);
    throw new Error(error.success ? error.data.error : '목소리 요청을 처리하지 못했습니다.');
  }
  return schema.parse(data);
}
export const voiceCatalogQuery = {
  queryKey: ['voices'],
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    voiceRequest('/api/voices', voiceCatalogSchema, { signal }),
};
export function voiceDetailQuery(id: string) {
  return {
    queryKey: ['voice', id],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      voiceRequest(`/api/voices/${id}`, voiceDetailSchema, { signal }),
  };
}
export function jsonRequest(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
