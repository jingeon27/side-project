import { describe, expect, it } from 'vitest';

import { DEFAULT_PROFILE } from '../../shared/config.ts';
import { analyze } from '../perception/vision.ts';
import { fixture } from '../testing/fixture.ts';
import { assertDecision, decide } from './policy.ts';

const state = { actions: 0, lastActionAt: -Infinity };

describe('screen-driven card decisions', () => {
  it('defends an invading enemy with an affordable hand card', async () => {
    const { image, templates } = await fixture({ elixir: 3 });
    const observation = await analyze(image, DEFAULT_PROFILE, templates, 1000);
    const action = decide(observation, DEFAULT_PROFILE, state, 1100);
    expect(action?.card).toBe('knight');
    expect(action?.target.y).toBeGreaterThan(DEFAULT_PROFILE.riverY);
    expect(() => assertDecision(action!, observation, DEFAULT_PROFILE)).not.toThrow();
  });

  it('saves elixir for an attack and then places its win condition', async () => {
    const low = await fixture({ elixir: 5, enemies: 0 });
    expect(
      decide(await analyze(low.image, DEFAULT_PROFILE, low.templates, 1000), DEFAULT_PROFILE, state, 1100),
    ).toBeNull();
    const high = await fixture({ elixir: 8, enemies: 0 });
    expect(
      decide(await analyze(high.image, DEFAULT_PROFILE, high.templates, 1000), DEFAULT_PROFILE, state, 1100)
        ?.card,
    ).toBe('giant');
  });

  it('does not act on stale, unidentified, unaffordable or cooling-down state', async () => {
    const { image, templates } = await fixture({ elixir: 3 });
    const observation = await analyze(image, DEFAULT_PROFILE, templates, 1000);
    expect(decide(observation, DEFAULT_PROFILE, state, 3000)).toBeNull();
    expect(decide({ ...observation, inBattle: false }, DEFAULT_PROFILE, state, 1100)).toBeNull();
    expect(decide({ ...observation, elixir: 0 }, DEFAULT_PROFILE, state, 1100)).toBeNull();
    expect(decide(observation, DEFAULT_PROFILE, { ...state, lastActionAt: 900 }, 1100)).toBeNull();
  });

  it('refuses a unit placement across the river even if a caller constructs one', async () => {
    const { image, templates } = await fixture();
    const observation = await analyze(image, DEFAULT_PROFILE, templates, 1000);
    expect(() =>
      assertDecision(
        { slot: 0, card: 'knight', target: { x: 95, y: 150 }, reason: '' },
        observation,
        DEFAULT_PROFILE,
      ),
    ).toThrow('내 진영');
  });

  it('places graveyard across the river when an ally approaches the bridge', async () => {
    const { image, templates } = await fixture({ elixir: 10, enemies: 0 });
    const base = await analyze(image, DEFAULT_PROFILE, templates, 1000);
    const observation = {
      ...base,
      allies: [{ x: 95, y: DEFAULT_PROFILE.riverY + 20, width: 20 }],
      hand: base.hand.map((card, slot) => ({
        ...card,
        card: slot === 0 ? ('graveyard' as const) : null,
        ready: slot === 0,
      })),
    };
    const action = decide(observation, DEFAULT_PROFILE, state, 1100);
    expect(action?.card).toBe('graveyard');
    expect(action?.target.y).toBeLessThan(DEFAULT_PROFILE.riverY);
    expect(() => assertDecision(action!, observation, DEFAULT_PROFILE)).not.toThrow();
  });

  it('does not spend graveyard as a defensive damage spell against a cluster', async () => {
    const { image, templates } = await fixture({ elixir: 10, enemies: 3 });
    const base = await analyze(image, DEFAULT_PROFILE, templates, 1000);
    const observation = {
      ...base,
      hand: base.hand.map((card, slot) => ({
        ...card,
        card: slot === 0 ? ('graveyard' as const) : null,
        ready: slot === 0,
      })),
    };
    expect(decide(observation, DEFAULT_PROFILE, state, 1100)).toBeNull();
  });
});
