import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { serializeDecision, type DecisionContext } from './decision-v3.ts';

it('shares the simulation contract while keeping resource uncertainty and special forms', () => {
  const example = JSON.parse(
    readFileSync(new URL('./testing/decision-context.json', import.meta.url), 'utf8'),
  ) as { context: DecisionContext; prompt: string };
  expect(serializeDecision(example.context)).toBe(example.prompt);
  expect(example.prompt).toContain('enemyMana=3.1-7.8');
  expect(example.prompt).toContain('K3.5,17E');
  expect(example.prompt).toContain('I3.5,22H');
  expect(example.prompt).toContain('A:W B:G3.5,25.5 C:U');
  expect(example.prompt.length).toBeLessThan(500);
});
