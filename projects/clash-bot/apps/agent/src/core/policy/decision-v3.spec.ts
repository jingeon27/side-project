import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { BattleMemory } from '../battle/battle-state.ts';
import type { CardId } from '../cards.ts';
import { tilePoint } from '../geometry.ts';
import { DEFAULT_PROFILE } from '../profile.ts';
import { affordableCandidates } from './candidates.ts';
import { decisionContext, decisionPrompt, serializeDecision, type DecisionContext } from './decision-v3.ts';

const profile = DEFAULT_PROFILE;
const deck: CardId[] = [
  'graveyard',
  'poison',
  'goblin_hut',
  'furnace',
  'knight',
  'ice_wizard',
  'skeletons',
  'barbarian_barrel',
];

it('shares the simulation contract while keeping resource uncertainty and special forms', () => {
  const example = JSON.parse(
    readFileSync(new URL('../../../test-fixtures/decision-context.json', import.meta.url), 'utf8'),
  ) as { context: DecisionContext; prompt: string };
  expect(serializeDecision(example.context)).toBe(example.prompt);
  expect(example.prompt).toContain('enemyMana=3.1-7.8');
  expect(example.prompt).toContain('K3.5,17E');
  expect(example.prompt).toContain('I3.5,22H');
  expect(example.prompt).toContain('rG14.5,6.5@1s');
  expect(
    serializeDecision({ ...example.context, effects: [['red', 'graveyard', 14.5, 6.5, null]] }),
  ).toContain('rG14.5,6.5@?s');
  expect(example.prompt).toContain('A:W B:G3.5,25.5 C:U');
  expect(example.prompt.length).toBeLessThan(1800);
  expect(tilePoint(profile, { x: 184, y: profile.riverY })).toEqual([9, 16]);
});

// 실제 상황의 좌표·주문 경과 시간·합법 후보가 판단 입력까지 전달되는지 확인한다.
it('builds the candidate input from a live battle situation', () => {
  const cards: CardId[] = ['graveyard', 'poison', 'goblin_hut', 'furnace'];
  const rich = new BattleMemory(deck, { knight: 2, furnace: 2 }).observe({
    at: 20_000,
    amount: 7.4,
    hand: cards,
    inputPending: false,
    elixirRange: { min: 7.1, max: 7.6 },
    allies: [
      { card: null, kind: 'knight', variant: 'evolution', x: 95, y: profile.riverY + 14, confidence: 0.98 },
      { card: 'ice_wizard', variant: 'hero', x: 120, y: profile.riverY + 90, confidence: 0.9 },
    ],
    enemies: [
      { card: 'graveyard', kind: 'skeleton', x: 273, y: profile.riverY - 40, confidence: 0.9 },
      { card: 'barbarian_barrel', x: 250, y: profile.riverY + 30, confidence: 0.8 },
    ],
    effects: [
      {
        card: 'graveyard',
        side: 'red',
        x: 95,
        y: profile.riverY + 120,
        radius: 40,
        confidence: 0.9,
        visibleAgeMs: 2400,
        onsetCertain: true,
        source: 'visual',
      },
    ],
    ability: {
      card: 'ice_wizard',
      cost: 2,
      instance: 1,
      availability: 'ready',
      buttonVisible: true,
      observedAt: 20_000,
      target: { x: 300, y: 600 },
      source: 'screen_button',
      visualDistance: 3,
      blueCoverage: 0.6,
    },
  });
  const knownCycle = {
    ...rich,
    opponent: {
      ...rich.opponent,
      cycle: {
        ...rich.opponent.cycle,
        returnsAfterPlays: { ...rich.opponent.cycle.returnsAfterPlays, poison: { min: 4, max: 4 } },
      },
    },
  };
  const cycleContext = decisionContext(profile, cards, 7.4, [], knownCycle);
  expect(cycleContext.enemyCycle).toContainEqual(['poison', 4, 4]);
  expect(serializeDecision(cycleContext)).toContain('enemyCycle=P4-4');
  const threats = rich.opponent.units.filter((unit) => unit.y > profile.riverY).map(({ x, y }) => ({ x, y }));
  const uncertain = { ...rich, effects: rich.effects?.map((effect) => ({ ...effect, onsetCertain: false })) };
  expect(decisionContext(profile, cards, 7.4, [], uncertain).effects?.[0]?.[4]).toBeNull();
  const richPrompt = decisionPrompt(
    profile,
    cards,
    7.4,
    affordableCandidates(profile, cards, 7.4, threats, rich),
    rich,
  );
  expect(richPrompt).toContain('effects=rG3.5,7.2@2s');
  expect(richPrompt).toMatch(/[A-Z]:Uq0/);
  expect(richPrompt).toMatch(/P[0-9.,]+h[0-9]+(?:z|d[0-9]+(?:-[0-9]+)?k[0-9]+(?:-[0-9]+)?)/);

  const hand: Array<CardId | null> = ['knight', null, 'poison', null];
  const sparse = new BattleMemory(deck).observe({
    at: 1000,
    amount: 5,
    hand,
    inputPending: false,
    allies: [],
    enemies: [],
  });
  const sparsePrompt = decisionPrompt(
    profile,
    hand,
    5,
    affordableCandidates(profile, hand, 5, [], sparse),
    sparse,
  );
  expect(sparsePrompt).toContain('hand=K?P?');
  expect(sparsePrompt).toContain('effects=;skill=0');
});
