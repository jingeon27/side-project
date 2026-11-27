'use client';

import { readingSchema, type TReadingInput } from './contracts';

export async function requestReading(input: TReadingInput) {
  const response = await fetch('/api/readings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error('Reading unavailable');
  return readingSchema.parse(await response.json());
}
