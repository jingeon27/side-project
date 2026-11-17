import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BattleMemory, type BattleSituation, type FieldEffect } from '../battle/battle-state.ts';
import type { CardId } from '../cards.ts';
import { DEPLOYMENT } from '../deployment.ts';
import { screenPoint, tilePoint } from '../geometry.ts';
import { blockedDeployment, ownPoint } from '../placement/placement.ts';
import { DEFAULT_PROFILE, loadProfile } from '../profile.ts';
import { actionCandidates } from './actions.ts';
import { affordableCandidates } from './candidates.ts';

const deck: CardId[] = [
  'knight',
  'furnace',
  'ice_wizard',
  'skeletons',
  'graveyard',
  'poison',
  'goblin_hut',
  'barbarian_barrel',
];
const scene = (effects: FieldEffect[] = []) =>
  new BattleMemory(deck).observe({
    at: 10000,
    amount: 10,
    hand: ['knight', 'furnace', 'ice_wizard', 'skeletons'],
    allies: [],
    enemies: [],
    effects,
    inputPending: false,
  });

describe('placement constraints and Graveyard defense regressions', () => {
  it('keeps legal King-rear troop choices within the Qwen action budget, including against a visible threat', async () => {
    const profile = await loadProfile(
      fileURLToPath(new URL('../../../../../profiles/counterpush.json', import.meta.url)),
    );
    const calm = scene();
    const threatened = {
      ...calm,
      opponent: {
        ...calm.opponent,
        units: [{ card: 'knight', x: 95, y: 330, confidence: 0.95 }],
      },
    } satisfies BattleSituation;
    const cards: CardId[] = ['knight', 'furnace', 'ice_wizard', 'skeletons'];
    for (const situation of [calm, threatened]) {
      const actions = affordableCandidates(profile, cards, 10, situation.opponent.units, situation);
      expect(actions.length).toBeLessThanOrEqual(26);
      for (const card of cards) {
        const positions = actions.filter((action) => action.card === card);
        for (const tile of situation === threatened && card === 'ice_wizard'
          ? DEPLOYMENT.kingBackTiles.slice(0, 1)
          : DEPLOYMENT.kingBackTiles)
          expect(positions.map((action) => tilePoint(profile, action.target))).toContainEqual(tile);
        if (situation === threatened && card === 'ice_wizard')
          expect(positions.filter((action) => tilePoint(profile, action.target)[1] > 2)).toHaveLength(4);
        expect(positions.every((action) => !blockedDeployment(profile, card, action.target, situation))).toBe(
          true,
        );
      }
    }
    const king = screenPoint(profile, DEPLOYMENT.kingTowerTile);
    expect(blockedDeployment(profile, 'knight', king)).toBe(true);
    expect(blockedDeployment(profile, 'goblin_hut', king)).toBe(true);
    const behind = ownPoint(profile, 'knight', screenPoint(profile, [9, 1]));
    expect(behind).not.toBeNull();
    if (behind) expect(tilePoint(profile, behind)).toEqual([9, 1]);
  });
  it('offers forward, middle and rear choices instead of fixing every idle unit behind a tower', () => {
    const cards: CardId[] = ['knight', 'furnace', 'ice_wizard', 'skeletons'];
    const actions = actionCandidates(DEFAULT_PROFILE, cards, 10, [], scene());
    for (const card of cards) {
      const positions = actions.filter((action) => action.card === card);
      expect(positions.some((action) => action.target.y < DEFAULT_PROFILE.riverY + 100)).toBe(true);
      expect(new Set(positions.map((action) => action.target.y)).size).toBeGreaterThan(1);
      expect(positions.every((action) => !blockedDeployment(DEFAULT_PROFILE, card, action.target))).toBe(
        true,
      );
    }
    expect(actions.length).toBeLessThanOrEqual(26);
  });
  it('can defend an active Graveyard before three skeletons are recognized and avoids visible Poison for fragile ranged support', () => {
    const graveyard: FieldEffect = {
      card: 'graveyard',
      side: 'red',
      x: 273,
      y: 406,
      radius: 68,
      confidence: 0.98,
      visibleAgeMs: 2000,
      onsetCertain: true,
      source: 'visual',
    };
    const poison: FieldEffect = {
      card: 'poison',
      side: 'red',
      x: 215,
      y: 380,
      radius: 60,
      confidence: 0.98,
      visibleAgeMs: 500,
      onsetCertain: true,
      source: 'visual',
    };
    const actions = actionCandidates(
      DEFAULT_PROFILE,
      ['poison', 'ice_wizard', 'furnace', 'barbarian_barrel'],
      10,
      [],
      scene([graveyard, poison]),
    );
    expect(
      actions.some(
        (action) => action.card === 'poison' && action.target.x === 273 && action.target.y === 406,
      ),
    ).toBe(true);
    const wizard = actions.find(
      (action) => action.card === 'ice_wizard' && action.description.includes('Graveyard defense'),
    )!;
    expect(wizard).toBeDefined();
    expect(Math.hypot(wizard.target.x - poison.x, wizard.target.y - poison.y)).toBeGreaterThan(poison.radius);
    expect(blockedDeployment(DEFAULT_PROFILE, 'ice_wizard', wizard.target)).toBe(false);
    expect(
      actions.some(
        (action) => action.card === 'barbarian_barrel' && action.description.includes('Graveyard skeletons'),
      ),
    ).toBe(true);
    expect(actions.length).toBeLessThanOrEqual(26);
  });
});
