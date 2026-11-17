import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { cardChoice } from './choice.ts';

const fixture = JSON.parse(
  readFileSync(new URL('../../../test-fixtures/fast-choice-cases.json', import.meta.url), 'utf8'),
) as {
  cases: Array<{ name: string; families: string[]; probabilities: number[]; choice: number }>;
};

describe('card choice before placement choice', () => {
  it.each(fixture.cases)('$name', (item) => {
    expect(cardChoice(item.families, item.probabilities)).toBe(item.choice);
  });

  it('rejects unaligned or invalid distributions', () => {
    expect(() => cardChoice([], [])).toThrow();
    expect(() => cardChoice(['wait'], [])).toThrow();
    expect(() => cardChoice(['wait'], [Number.NaN])).toThrow();
    expect(() => cardChoice(['wait'], [0])).toThrow();
    expect(() => cardChoice(['wait', 'ability'], [-1, 2])).toThrow();
  });
});
