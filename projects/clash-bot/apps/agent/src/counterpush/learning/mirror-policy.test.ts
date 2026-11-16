import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { BattleMemory, type BattleSituation } from '../../core/battle/battle-state.ts';
import { COUNTERPUSH_DECK } from '../../core/deck.ts';
import { serializeDecision } from '../../core/policy/decision-v3.ts';
import { DEFAULT_PROFILE } from '../../core/profile.ts';
import { mirrorActions, mirrorContext, reflectPoint } from './mirror-policy.ts';

const before = () =>
  new BattleMemory([...COUNTERPUSH_DECK]).observe({
    at: 1000,
    amount: 9,
    hand: ['knight', 'skeletons', 'graveyard', 'poison'],
    inputPending: false,
    allies: [{ card: 'knight', kind: 'knight', confidence: 0.98, x: 95, y: 160 }],
    enemies: [{ card: 'ice_wizard', kind: 'ice_wizard', confidence: 0.98, x: 273, y: 220, variant: 'hero' }],
  });

it('teaches BLUE actions from the winning RED field without leaking BLUE private state', () => {
  const situation = before();
  const actions = mirrorActions(DEFAULT_PROFILE, [...COUNTERPUSH_DECK], situation);
  const context = mirrorContext(DEFAULT_PROFILE, situation, actions);
  expect(context.hand).toEqual([null, null, null, null]);
  expect(context.elixir).toEqual(situation.opponent.elixir);
  expect(context.enemyElixir).toEqual({ min: 0, max: 10 });
  expect(context.skill).toBe('unknown');
  expect(context.own[0]?.[0]).toBe('ice_wizard');
  expect(context.enemy[0]?.[0]).toBe('knight');
  expect(reflectPoint(DEFAULT_PROFILE, { x: 95, y: 160 })).toEqual({ x: 95, y: 428 });
  const changed = {
    ...situation,
    own: {
      ...situation.own,
      hand: ['furnace', 'goblin_hut', 'ice_wizard', 'barbarian_barrel'],
      elixir: { min: 1, max: 1 },
      cycle: null,
      ability: undefined,
    },
  } satisfies BattleSituation;
  expect(serializeDecision(mirrorContext(DEFAULT_PROFILE, changed, actions))).toBe(
    serializeDecision(context),
  );
  expect(actions.length).toBeLessThanOrEqual(26);
  expect(serializeDecision(context)).toContain('ClashRoyale:choose BLUE action');
  expect(serializeDecision(context)).toContain('hand=????');
});

it('shares the mirrored public context byte for byte with the Python learner', () => {
  const fixture = JSON.parse(
    readFileSync(new URL('../../../test-fixtures/mirror-actor-context.json', import.meta.url), 'utf8'),
  ) as {
    sample: { situation: BattleSituation; candidates: ReturnType<typeof mirrorActions> };
    prompt: string;
  };
  expect(
    serializeDecision(mirrorContext(DEFAULT_PROFILE, fixture.sample.situation, fixture.sample.candidates)),
  ).toBe(fixture.prompt);
});
