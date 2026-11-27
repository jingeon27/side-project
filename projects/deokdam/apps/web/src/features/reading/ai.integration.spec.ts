import request from 'supertest';
import { expect, it } from 'vitest';

import { readingSchema, type TReadingInput } from './contracts';
import { readingReferences } from './knowledge/corpus';

const origin = new URL(process.env.DEOKDAM_TEST_ORIGIN ?? 'http://127.0.0.1:3469');
if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1') {
  throw new Error('DEOKDAM_TEST_ORIGIN must identify an isolated loopback web server');
}

const cases = [
  { topic: 'job', concern: 'silence', element: 'metal', experience: 'interview' },
  { topic: 'parent', concern: 'first-words', element: 'wood', experience: 'conversation' },
  { topic: 'admission', concern: 'scores', element: 'water' },
] as const satisfies readonly TReadingInput[];

it.each(cases)('uses the running local model to select referenced advice for $topic', async (input) => {
  const response = await request(origin.origin).post('/api/readings').send(input).expect(200);
  const reading = readingSchema.parse(response.body);
  expect(reading.mode).toBe('ai');
  expect(reading.sources).toHaveLength(2);
  expect(reading.sources?.[0]?.id).toBe(input.element);

  const selected = readingReferences.find(({ id }) => id === reading.sources?.[1]?.id);
  if (selected?.source !== 'editorial') throw new Error('Expected the model to select an editorial practice');
  expect(selected.scope).toBe(input.concern);
  expect(reading.interpretation).toContain(selected.advice);
  expect(reading.action).toBe(selected.title);
});
