import { setTimeout as delay } from 'node:timers/promises';

import { sourcePoint } from './adb.ts';
import { type Point, type Profile } from './config.ts';
import { assertDecision, decide, type Decision, type PolicyState } from './policy.ts';
import { analyze, type Observation, type Templates } from './vision.ts';

export type Transport = {
  screenshot: () => Promise<Buffer>;
  isGameForeground: () => Promise<boolean>;
  tap: (point: Point) => Promise<void>;
};
export type RunOptions = {
  live: boolean;
  seconds: number;
  intervalMs: number;
  maxActions: number;
  signal: AbortSignal;
  log: (event: Record<string, unknown>) => Promise<void>;
};
export type RuntimeState = PolicyState & {
  stableFrames: number;
  previousHash: string | null;
  pending: { card: string; slot: number; since: number } | null;
};

export function updateObservation(state: RuntimeState, observation: Observation, now: number): boolean {
  state.stableFrames = observation.inBattle ? state.stableFrames + 1 : 0;
  if (state.pending) {
    const current = observation.hand[state.pending.slot];
    if (observation.inBattle && current?.card && current.card !== state.pending.card) {
      state.pending = null;
      return true;
    } else if (!observation.inBattle || now - state.pending.since > 6000)
      throw new Error('카드 사용 후 손패 변경을 확인하지 못했습니다. 반복 입력을 멈췄습니다.');
  }
  return false;
}

export async function executeDecision(
  device: Transport,
  decision: Decision,
  observation: Observation,
  profile: Profile,
  signal: AbortSignal,
  now = Date.now,
): Promise<void> {
  assertDecision(decision, observation, profile);
  const fresh = () => {
    signal.throwIfAborted();
    if (now() - observation.capturedAt > 1500) throw new Error('화면 분석이 오래되어 입력을 중단했습니다.');
  };
  fresh();
  if (!(await device.isGameForeground())) throw new Error('게임이 앞에 있지 않아 입력을 중단했습니다.');
  fresh();
  await device.tap(sourcePoint(observation.hand[decision.slot]!.point, observation.viewport));
  await delay(100, undefined, { signal });
  fresh();
  if (!(await device.isGameForeground())) throw new Error('게임 전환을 감지해 배치 입력을 중단했습니다.');
  fresh();
  await device.tap(sourcePoint(decision.target, observation.viewport));
}

export async function runBot(
  device: Transport,
  profile: Profile,
  templates: Templates,
  options: RunOptions,
): Promise<{ frames: number; actions: number; confirmed: number; pending: boolean; elapsedMs: number }> {
  const state: RuntimeState = {
    actions: 0,
    lastActionAt: -Infinity,
    stableFrames: 0,
    previousHash: null,
    pending: null,
  };
  const started = Date.now();
  const summary = { frames: 0, actions: 0, confirmed: 0, pending: false, elapsedMs: 0 };
  await options.log({ type: 'started', live: options.live, intervalMs: options.intervalMs });
  try {
    for (const iteration of Array.from({
      length: Math.ceil((options.seconds * 1000) / options.intervalMs),
    })) {
      void iteration;
      if (
        options.signal.aborted ||
        Date.now() - started >= options.seconds * 1000 ||
        (state.actions >= options.maxActions && !state.pending)
      )
        break;
      const frameStarted = Date.now();
      if (!(await device.isGameForeground())) {
        state.stableFrames = 0;
        await options.log({ type: 'waiting', reason: '클래시로얄 화면을 기다립니다.' });
        await delay(options.intervalMs, undefined, { signal: options.signal });
        continue;
      }
      const capturedAt = Date.now();
      const bytes = await device.screenshot();
      const observation = await analyze(bytes, profile, templates, capturedAt);
      summary.frames++;
      if (updateObservation(state, observation, Date.now())) {
        summary.confirmed++;
        await options.log({ type: 'confirmed', at: Date.now(), count: summary.confirmed });
      }
      await options.log({
        type: 'observation',
        at: capturedAt,
        battle: observation.inBattle,
        elixir: observation.elixir,
        hand: observation.hand.map((card) => ({
          card: card.card,
          ready: card.ready,
          distance: Math.round(card.distance),
        })),
        enemyMarkers: observation.enemies.length,
        analysisMs: Date.now() - capturedAt,
      });
      const decision =
        state.actions < options.maxActions &&
        state.stableFrames >= 2 &&
        !state.pending &&
        state.previousHash !== observation.frameHash
          ? decide(observation, profile, state, Date.now())
          : null;
      state.previousHash = observation.frameHash;
      if (decision) {
        if (options.live) await executeDecision(device, decision, observation, profile, options.signal);
        state.actions++;
        state.lastActionAt = Date.now();
        state.pending = options.live ? { slot: decision.slot, card: decision.card, since: Date.now() } : null;
        await options.log({ type: options.live ? 'input_sent' : 'suggested', at: Date.now(), ...decision });
      }
      await delay(Math.max(0, options.intervalMs - (Date.now() - frameStarted)), undefined, {
        signal: options.signal,
      });
    }
  } catch (error) {
    if (!options.signal.aborted) {
      await options.log({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  } finally {
    summary.actions = state.actions;
    summary.pending = Boolean(state.pending);
    summary.elapsedMs = Date.now() - started;
    await options.log({ type: 'stopped', ...summary });
  }
  return summary;
}
