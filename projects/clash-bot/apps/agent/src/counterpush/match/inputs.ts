import { setTimeout as delay } from 'node:timers/promises';

import { CARD_INFO } from '../../core/cards.ts';
import type { QwenAction } from '../../core/policy/actions.ts';
import type { Profile } from '../../core/profile.ts';
import type { CounterpushBrowser } from '../browser/browser.ts';
import { plausibleSpend } from '../perception/elixir.ts';
import { difference } from '../perception/hand.ts';
import { abilityInputCheck, canUseHeroAbility } from '../perception/hero-ability.ts';
import { abilityCheckEvent, inputCheckEvent } from './episode-events.ts';
import { confirmPlacement } from './placement-check.ts';
import type { MatchRecorder } from './recorder.ts';
import type { MatchSensor, OwnFrame } from './sensor.ts';
import type { MatchState } from './state.ts';

export type InputContext = {
  browser: CounterpushBrowser;
  sensor: MatchSensor;
  recorder: MatchRecorder;
  state: MatchState;
  profile: Profile;
  signal: AbortSignal;
};
type Decision = { frame: number; selected: QwenAction; before: OwnFrame; latest: OwnFrame };

// 세 번 연속 사용이 확인되지 않으면 이 경기의 입력을 멈추고 학습에서 뺀다.
async function countUnconfirmed(context: InputContext, reason: string) {
  if (context.state.unconfirmed < 3) return;
  context.state.inputSuspended = true;
  await context.recorder.event({ type: 'input_recovery', reason, learningEligible: false });
}

export async function useHeroAbility(context: InputContext, decision: Decision) {
  const { browser, sensor, recorder, state, signal } = context;
  const { frame, selected, before, latest } = decision;
  const beforeAbility = before.situation.own.ability;
  const latestAbility = latest.situation.own.ability;
  if (
    !canUseHeroAbility(beforeAbility, latestAbility, latest.state.elixir, Date.now()) ||
    latest.elixirConfidence < 0.9
  ) {
    await recorder.event({ type: 'rejected', frame, reason: 'ability_no_longer_ready' });
    return;
  }
  state.inputPending = true;
  const sentAt = Date.now();
  if (!(await browser.activateAbility())) {
    state.inputPending = false;
    return;
  }
  state.actions++;
  state.abilityActions++;
  await recorder.event({ type: 'ability_sent', frame, action: selected, sentAt });
  await delay(300, undefined, { signal });
  const checks: Array<{ changed: boolean; handUnchanged: boolean; confirmed: boolean; spent: number }> = [];
  for (const attempt of [0, 1, 2, 3]) {
    if (attempt) await delay(200, undefined, { signal });
    if ((await browser.phase()) !== 'battle') break;
    const after = await sensor.capture();
    const spent = latest.state.elixir - after.state.elixir;
    checks.push({
      ...abilityInputCheck({
        before: latestAbility!,
        after: after.situation.own.ability!,
        beforeCards: latest.cards,
        afterCards: after.cards,
        spent,
        elixirReliable: after.elixirConfidence >= 0.9,
      }),
      spent,
    });
    if (checks.at(-1)!.confirmed) break;
  }
  const check = checks.at(-1);
  if (check?.confirmed) {
    sensor.abilityButton.markUsed(latestAbility!.instance);
    sensor.memory.ownAbility(sentAt, latestAbility!.instance);
    state.confirmed++;
    state.abilityConfirmed++;
    state.unconfirmed = 0;
  }
  if (!check?.confirmed) state.unconfirmed++;
  state.inputPending = false;
  await recorder.event(abilityCheckEvent({ frame, check, checks: checks.length, action: selected }));
  await countUnconfirmed(context, 'three_unconfirmed_ability_inputs');
  state.errors = 0;
}

export async function playCard(context: InputContext, decision: Decision) {
  const { browser, sensor, recorder, state, profile, signal } = context;
  const { frame, selected, before, latest } = decision;
  const action = confirmPlacement(selected, before.cards, before.state, latest.state, profile, Date.now());
  if (!action || latest.elixirConfidence < 0.9) {
    await recorder.event({ type: 'rejected', frame, reason: 'stale_or_changed_screen' });
    return;
  }
  state.inputPending = true;
  const sentAt = Date.now();
  if (!(await browser.play(profile, selected.slot, selected.target))) {
    state.inputPending = false;
    return;
  }
  state.actions++;
  await recorder.event({ type: 'input_sent', frame, action, sentAt });
  await delay(300, undefined, { signal });
  const cost = CARD_INFO[selected.card!].cost;
  const checks: Array<{ after: OwnFrame; changed: boolean; spent: number; confirmed: boolean }> = [];
  for (const attempt of [0, 1, 2, 3]) {
    if (attempt) await delay(200, undefined, { signal });
    if ((await browser.phase()) !== 'battle') break;
    const after = await sensor.capture();
    const changed = difference(latest.state.hand[action.slot]!, after.state.hand[action.slot]!) > 15;
    const spent = latest.state.elixir - after.state.elixir;
    // A dark animation frame can look like a loss of all elixir. Require a
    // recognizable replacement card and a spend compatible with its cost.
    const confirmed =
      changed &&
      after.elixirConfidence >= 0.9 &&
      after.cards[action.slot] !== null &&
      after.cards[action.slot] !== selected.card &&
      plausibleSpend(spent, cost, after.capturedAt - latest.capturedAt);
    checks.push({ after, changed, spent, confirmed });
    if (confirmed) break;
  }
  const check = checks.at(-1);
  if (check?.confirmed) {
    state.confirmed++;
    state.unconfirmed = 0;
    sensor.memory.ownPlay(selected.card!, sentAt, action.target, check.after.cards);
    if (selected.card === 'ice_wizard') sensor.abilityButton.newDeployment();
  }
  if (!check?.confirmed) {
    state.unconfirmed++;
    sensor.memory.ownEvolutions.uncertain();
  }
  state.inputPending = false;
  await recorder.event(inputCheckEvent({ frame, check, expectedCost: cost, checks: checks.length, action }));
  await countUnconfirmed(context, 'three_unconfirmed_card_inputs');
  state.errors = 0;
}
