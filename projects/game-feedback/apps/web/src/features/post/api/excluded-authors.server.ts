import 'server-only';

import { z } from 'zod';

const ExcludedAuthorsSchema = z.object({ userIds: z.array(z.string()) });

interface IExcludedAuthorsRequest {
  baseUrl: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}
/** 차단 관계는 사용자마다 달라 캐시하지 않는다. 자신을 차단한 사람이 드러나지 않게 브라우저가 닿지 않는 내부 경로로 받는다. */
export async function requestExcludedAuthors({
  baseUrl,
  headers,
  signal,
}: IExcludedAuthorsRequest): Promise<ReadonlySet<string>> {
  const response = await fetch(`${baseUrl}/internal/visibility/excluded-authors`, { headers, signal });
  if (!response.ok) throw new Error(`Excluded authors request failed with ${response.status}.`);
  return new Set(ExcludedAuthorsSchema.parse(await response.json()).userIds);
}
