import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { trophyProbabilities } from './actor.ts';

const cases = JSON.parse(
  readFileSync(new URL('../../test-fixtures/trophy-behavior-cases.json', import.meta.url), 'utf8'),
) as Array<{
  logits: number[];
  bias: number[];
  temperature: number;
  exploration: number;
  expected: number[];
}>;
it.each(cases)('uses the exact same categorical probabilities as the CPU PPO learner', (row) => {
  const actual = trophyProbabilities(row.logits, row.bias, row.temperature, row.exploration);
  actual.forEach((p, i) => expect(p).toBeCloseTo(row.expected[i] ?? 0, 10));
  expect(actual.every((p) => p > 0)).toBe(true);
});
it('rejects invalid action distributions instead of replacing them with a wait', () => {
  expect(() => trophyProbabilities([0, 0], [0], 1, 0.01)).toThrow();
  expect(() => trophyProbabilities([NaN], [0], 1, 0.01)).toThrow();
  expect(() => trophyProbabilities([0], [0], 0, 0.01)).toThrow();
  expect(() => trophyProbabilities([0], [0], 1, NaN)).toThrow();
});
