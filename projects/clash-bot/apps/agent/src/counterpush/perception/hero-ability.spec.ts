import { readFile } from 'node:fs/promises';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { DEFAULT_PROFILE, type CardId } from '../../config.ts';
import { actionCandidates, choicePrompt } from '../../qwen-actions.ts';
import { BattleMemory } from '../domain/battle-state.ts';
import { COUNTERPUSH_DECK, COUNTERPUSH_EVOLUTIONS } from '../runtime/browser.ts';
import { abilityInputCheck, canUseHeroAbility, HeroAbilityButton } from './hero-ability.ts';

const hand: CardId[] = ['knight', 'furnace', 'ice_wizard', 'skeletons'];
const image = async (name: string) =>
  sharp({ create: { width: 368, height: 652, channels: 3, background: '#000' } })
    .composite([
      {
        input: await readFile(new URL(`../testing/abilities/${name}.png`, import.meta.url)),
        left: 317,
        top: 477,
      },
    ])
    .png()
    .toBuffer();

describe('visible Hero Ice Wizard activation', () => {
  it('recognizes the colored button, rejects absence and grayscale, and permits one confirmed use per deployment', async () => {
    const reader = await HeroAbilityButton.load();
    expect((await reader.read(await image('ready'), 1000)).availability).toBe('untracked');
    reader.newDeployment();
    const ready = await reader.read(await image('ready-glow'), 1100);
    expect(ready.availability).toBe('ready');
    for (const name of ['absent', 'spell-background'])
      expect((await reader.read(await image(name), 1200)).availability).toBe('not_visible');
    const disabled = await sharp(await image('ready'))
      .greyscale()
      .toBuffer();
    expect((await reader.read(disabled, 1300)).availability).toBe('not_visible');
    expect(canUseHeroAbility(ready, ready, 2, 1200)).toBe(true);
    expect(canUseHeroAbility(ready, ready, 1, 1200)).toBe(false);
    expect(canUseHeroAbility(ready, ready, 2, 10_000)).toBe(false);
    expect(reader.markUsed(ready.instance)).toBe(true);
    expect(reader.markUsed(ready.instance)).toBe(false);
    expect((await reader.read(await image('ready'), 1400)).availability).toBe('used');
    reader.newDeployment();
    const next = await reader.read(await image('ready'), 1500);
    expect(next.availability).toBe('ready');
    expect(canUseHeroAbility(ready, next, 10, 1500)).toBe(false);
  });

  it('requires a visible transition, plausible two-elixir spend and unchanged hand for a training label', async () => {
    const reader = await HeroAbilityButton.load();
    reader.newDeployment();
    const before = await reader.read(await image('ready'), 1000);
    const after = await reader.read(await image('absent'), 1600);
    const input = { before, after, beforeCards: hand, afterCards: hand, spent: 2, elixirReliable: true };
    expect(abilityInputCheck(input).confirmed).toBe(true);
    expect(abilityInputCheck({ ...input, spent: 0 }).confirmed).toBe(false);
    expect(abilityInputCheck({ ...input, spent: 8 }).confirmed).toBe(false);
    expect(abilityInputCheck({ ...input, elixirReliable: false }).confirmed).toBe(false);
    expect(abilityInputCheck({ ...input, after: { ...after, buttonVisible: true } }).confirmed).toBe(false);
    expect(abilityInputCheck({ ...input, afterCards: ['poison', ...hand.slice(1)] }).confirmed).toBe(false);
  });

  it('offers an affordable skill independently of hand cards and supplies its two-elixir mechanics to Qwen', async () => {
    const reader = await HeroAbilityButton.load();
    reader.newDeployment();
    const memory = new BattleMemory([...COUNTERPUSH_DECK], COUNTERPUSH_EVOLUTIONS);
    const situation = memory.observe({
      at: 1000,
      amount: 2,
      hand: ['graveyard', 'poison', 'furnace', 'goblin_hut'],
      allies: [],
      enemies: [],
      inputPending: false,
      ability: await reader.read(await image('ready'), 1000),
    });
    const actions = actionCandidates(DEFAULT_PROFILE, situation.own.hand, 2, [], situation);
    const ability = actions.find((action) => action.kind === 'ability');
    expect(ability).toMatchObject({ card: 'ice_wizard', cost: 2, slot: 0, abilityInstance: 1 });
    expect(ability!.id).not.toBe(0);
    expect(choicePrompt(situation.own.hand, 2, [], actions, 'letter', situation)).toContain('does NOT draw');
    expect(
      actionCandidates(DEFAULT_PROFILE, situation.own.hand, 1, [], situation).some(
        (action) => action.kind === 'ability',
      ),
    ).toBe(false);
    expect(actionCandidates(DEFAULT_PROFILE, hand, 10, [], situation).length).toBeLessThanOrEqual(26);
  });

  it('deducts the skill cost without advancing either card FIFO or evolution charges, preserving historical snapshots', () => {
    const memory = new BattleMemory([...COUNTERPUSH_DECK], COUNTERPUSH_EVOLUTIONS);
    const before = memory.observe({
      at: 1000,
      amount: 5,
      hand,
      allies: [],
      enemies: [],
      inputPending: false,
    });
    expect(memory.ownAbility(1200, 1)).toBe(true);
    expect(memory.ownAbility(1300, 1)).toBe(false);
    const after = memory.observe({
      at: 2000,
      amount: 3.4,
      hand,
      allies: [],
      enemies: [],
      inputPending: false,
    });
    expect(after.elixirAccounting.ownSpent).toBe(2);
    expect(after.opponent.elixir.max).toBeCloseTo(5.6);
    expect(after.own.cycle).toEqual(before.own.cycle);
    expect(after.own.evolutions).toEqual(before.own.evolutions);
    expect(after.own.recentPlays).toEqual([]);
    expect(after.own.recentAbilities).toHaveLength(1);
    expect(before.own.recentAbilities).toEqual([]);
  });
});
