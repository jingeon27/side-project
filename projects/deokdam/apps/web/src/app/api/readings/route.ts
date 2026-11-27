import { createReading } from '@/features/reading/ai';
import { readingInputSchema } from '@/features/reading/contracts';

export async function POST(request: Request) {
  const data = readingInputSchema.safeParse(await request.json().catch(() => null));
  if (!data.success) return Response.json({ error: 'invalid_input' }, { status: 400 });
  try {
    return Response.json(await createReading(data.data));
  } catch {
    return Response.json({ error: 'reading_unavailable' }, { status: 503 });
  }
}
