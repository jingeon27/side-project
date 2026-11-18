import { z } from 'zod';

export async function readJsonResponse(response: Response, fallback: string): Promise<unknown> {
  if (response.ok) return response.json();
  const data: unknown = await response.json().catch(() => null);
  const error = z.object({ error: z.string() }).safeParse(data);
  throw new Error(error.success ? error.data.error : fallback);
}
