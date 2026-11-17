import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import type { DecisionContext } from '../policy/decision-v3.ts';
import { fastActionBias } from './tactics.ts';

const cases = JSON.parse(
  readFileSync(new URL('../../../test-fixtures/fast-tactics-cases.json', import.meta.url), 'utf8'),
) as Array<{
  name: string;
  context: DecisionContext;
  bias?: number[];
  preferred?: Array<[better: number, worse: number]>;
}>;

it.each(cases)('$name', ({ context, bias, preferred }) => {
  const before = JSON.stringify(context);
  const result = fastActionBias(context);
  expect(result).toHaveLength(context.actions.length);
  if (bias) result.forEach((score, index) => expect(score).toBeCloseTo(bias[index] ?? NaN, 5));
  for (const [better, worse] of preferred ?? []) {
    expect(result[better]).toBeGreaterThan(result[worse] ?? NaN);
  }
  expect(JSON.stringify(context)).toBe(before);
});
