import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { forecastEffect } from './combat-projection.ts';

type Case = { name: string; input: Parameters<typeof forecastEffect>[0]; expected: Record<string, unknown> };
const cases = JSON.parse(
  readFileSync(new URL('../../../test-fixtures/combat-cases.json', import.meta.url), 'utf8'),
) as Case[];
it.each(cases)('$name', ({ input, expected }) => {
  const output = forecastEffect(input);
  for (const [field, value] of Object.entries(expected)) {
    if (field === 'damageUpperBelow') {
      expect(output.damage[1]).toBeLessThan(Number(value));
      continue;
    }
    expect(output).toHaveProperty(field, value);
  }
});
