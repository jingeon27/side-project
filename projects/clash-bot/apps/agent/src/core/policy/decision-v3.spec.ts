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
  expect(example.prompt.length).toBeLessThan(900);
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
  const threats = rich.opponent.units.filter((unit) => unit.y > profile.riverY).map(({ x, y }) => ({ x, y }));
  const uncertain = { ...rich, effects: rich.effects?.map((effect) => ({ ...effect, onsetCertain: false })) };
  expect(decisionContext(profile, cards, 7.4, [], uncertain).effects?.[0]?.[4]).toBeNull();
  expect(decisionPrompt(profile, cards, 7.4, affordableCandidates(profile, cards, 7.4, threats, rich), rich))
    .toBe(`ClashRoyale:choose BLUE action letter. Tiles:x0-18,y0BLUE,16river,32RED. Equal mana,cap10,FIFO4. B=Barrel2 F=Furnace4 H=Hut4 G=Graveyard5 I=IceWizard3 K=Knight3 P=Poison4 S=Skeletons1 W=wait U=skill2. Missing bodies unknown. Reference physics unverified.
G9s area spawns;@age seconds,?=onset unknown.Defend that lane:P8s,I splash,B/melee partial. U once,no draw,freezes slowed enemies;ready!=useful targets.W saves mana. H triggers within6tiles;compare enemies,existing H,defense mana,W.
mana=7.4;enemyMana=0-7.6;hand=GPHF;next=KISB;own=K3.5,15E I5,9.4H;enemy=B13.1,13.8 s14.5,18.9;effects=rG3.5,7.2@2s;skill=1
A:W B:G3.5,27.3 C:G2.3,26.5 D:G3.5,25.4 E:G14.5,27.3 F:P3.5,7.2 G:P3.5,27.3 H:P14.5,27.3 I:H3.5,9.4 J:H1.4,6.9 K:H5.6,6.9 L:H13.1,12.5 M:H10.7,13.4 N:F3.5,9.4 O:F1.4,6.9 P:F5.6,6.9 Q:F3.5,11 R:F13.1,10.5 S:U`);

  const hand: Array<CardId | null> = ['knight', null, 'poison', null];
  const sparse = new BattleMemory(deck).observe({
    at: 1000,
    amount: 5,
    hand,
    inputPending: false,
    allies: [],
    enemies: [],
  });
  expect(decisionPrompt(profile, hand, 5, affordableCandidates(profile, hand, 5, [], sparse), sparse))
    .toBe(`ClashRoyale:choose BLUE action letter. Tiles:x0-18,y0BLUE,16river,32RED. Equal mana,cap10,FIFO4. B=Barrel2 F=Furnace4 H=Hut4 G=Graveyard5 I=IceWizard3 K=Knight3 P=Poison4 S=Skeletons1 W=wait U=skill2. Missing bodies unknown. Reference physics unverified.
mana=5;enemyMana=0-5.2;hand=K?P?;next=;own=;enemy=;effects=;skill=0
A:W B:K3.5,13.1 C:K14.5,13.1 D:K9,9.3 E:K6.3,3.9 F:K11.7,3.9 G:P3.5,27.3 H:P14.5,27.3`);
});
