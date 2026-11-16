import { readFile } from 'node:fs/promises';

import sharp from 'sharp';

import type { HeroAbility } from '../../core/battle/special-state.ts';
import type { CardId } from '../../core/cards.ts';
import { plausibleSpend } from './elixir.ts';
import { difference, fingerprint } from './hand.ts';

const PORTRAIT = { left: 317, top: 477, width: 30, height: 30 };
export const HERO_ABILITY_TARGET = { x: 330, y: 489 };

export class HeroAbilityButton {
  readonly reference: number[];
  readonly state = { instance: 0, consumed: false };
  constructor(reference: number[]) {
    this.reference = reference;
  }
  static async load() {
    return new HeroAbilityButton(
      await fingerprint(
        await readFile(new URL('../../../assets/counterpush/ice-wizard-ability.png', import.meta.url)),
      ),
    );
  }
  newDeployment() {
    this.state.instance++;
    this.state.consumed = false;
  }
  markUsed(instance: number) {
    if (instance !== this.state.instance || this.state.consumed) return false;
    this.state.consumed = true;
    return true;
  }
  async read(image: Buffer, at: number): Promise<HeroAbility> {
    const patch = await sharp(image).extract(PORTRAIT).removeAlpha().png().toBuffer();
    const pixels = await sharp(patch).raw().toBuffer();
    const blueCoverage =
      Array.from(
        { length: PORTRAIT.width * PORTRAIT.height },
        (_, i) =>
          pixels[i * 3 + 2]! > pixels[i * 3]! * 1.2 && pixels[i * 3 + 2]! > 130 && pixels[i * 3 + 1]! > 110,
      ).filter(Boolean).length /
      (PORTRAIT.width * PORTRAIT.height);
    const visualDistance = difference(this.reference, await fingerprint(patch));
    const buttonVisible = visualDistance < 15 && blueCoverage > 0.4;
    return {
      card: 'ice_wizard',
      cost: 2,
      instance: this.state.instance,
      availability: this.state.consumed
        ? 'used'
        : !this.state.instance
          ? 'untracked'
          : buttonVisible
            ? 'ready'
            : 'not_visible',
      buttonVisible,
      observedAt: at,
      target: HERO_ABILITY_TARGET,
      source: 'screen_button',
      visualDistance,
      blueCoverage,
    };
  }
}

export function canUseHeroAbility(
  before: HeroAbility | undefined,
  latest: HeroAbility | undefined,
  elixir: number,
  now: number,
) {
  return (
    !!before &&
    !!latest &&
    before.availability === 'ready' &&
    latest.availability === 'ready' &&
    before.instance === latest.instance &&
    latest.instance > 0 &&
    elixir >= latest.cost &&
    now - before.observedAt >= 0 &&
    now - before.observedAt < 8000 &&
    now - latest.observedAt >= 0 &&
    now - latest.observedAt < 1500
  );
}

export function abilityInputCheck(input: {
  before: HeroAbility;
  after: HeroAbility;
  beforeCards: Array<CardId | null>;
  afterCards: Array<CardId | null>;
  spent: number;
  elixirReliable: boolean;
}) {
  const knownMatches = input.afterCards.filter(
    (card, i) => card !== null && card === input.beforeCards[i],
  ).length;
  const handUnchanged =
    knownMatches >= 2 &&
    input.afterCards.every(
      (card, i) => card === null || input.beforeCards[i] === null || card === input.beforeCards[i],
    );
  const changed = input.before.buttonVisible && !input.after.buttonVisible;
  return {
    changed,
    handUnchanged,
    confirmed:
      input.before.availability === 'ready' &&
      input.before.instance === input.after.instance &&
      changed &&
      handUnchanged &&
      input.elixirReliable &&
      input.spent >= 1 &&
      plausibleSpend(input.spent, 2, input.after.observedAt - input.before.observedAt),
  };
}
