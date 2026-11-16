import { randomInt } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { match } from 'ts-pattern';

import type { SpawnPatterns } from '../../core/battle/spawn-patterns.ts';
import { COUNTERPUSH_DECK } from '../../core/deck.ts';
import { decisionContext, decisionProjection } from '../../core/policy/decision-v3.ts';
import type { Profile } from '../../core/profile.ts';
import type { DecisionOutput } from '../../qwen/learning-client.ts';
import { atomicWrite } from '../../shared/assets.ts';
import type { CounterpushBrowser } from '../browser/browser.ts';
import type { CounterpushVisionClient } from '../perception/vision-client.ts';
import type { Controller, DecisionRequest } from './controllers.ts';
import { resultEvent, waitCheckEvent } from './episode-events.ts';
import { playCard, useHeroAbility, type InputContext } from './inputs.ts';
import { MatchRecorder } from './recorder.ts';
import { MatchSensor, type OwnFrame } from './sensor.ts';
import { newMatchState } from './state.ts';

type Prediction = { done: boolean; output: DecisionOutput | null; error: unknown };

// 모델 판단을 기다리는 동안 controller 1은 화면을 계속 추적한다. 입력은 판단이 검증된 뒤에만 한다.
async function decide(context: InputContext, controller: Controller, request: DecisionRequest) {
  const prediction: Prediction = { done: false, output: null, error: null };
  const pending = controller
    .choose(request)
    .then((output) => {
      prediction.output = output;
    })
    .catch((error: unknown) => {
      prediction.error = error;
    })
    .finally(() => {
      prediction.done = true;
    });
  while (controller.tracksWhileDeciding && !prediction.done && (await context.browser.phase()) === 'battle') {
    // A completed prediction wakes immediately instead of waiting for another
    // 350ms polling interval. Perception never owns the action choice.
    await Promise.race([pending, delay(350, undefined, { signal: context.signal })]);
    if (!prediction.done) await context.sensor.capture();
  }
  await pending;
  return prediction;
}

async function decideAndAct(context: InputContext, controller: Controller, before: OwnFrame) {
  const { browser, recorder, state, profile, signal } = context;
  const input = {
    profile,
    cards: before.cards,
    elixir: before.state.elixir,
    threats: before.situation.opponent.units
      .filter((unit) => unit.y > profile.riverY)
      .map(({ x, y }) => ({ x, y })),
    situation: before.situation,
    clock: Math.max(0, before.capturedAt - state.firstBattleAt) / 1000,
  };
  // 후보 순서를 매번 섞어 첫 번째 토큰에 대한 편향을 줄인다.
  const candidates = controller
    .candidates(input)
    .map((action) => ({ action, order: randomInt(2 ** 32) }))
    .toSorted((first, second) => first.order - second.order)
    .map(({ action }) => action);
  if (candidates.length === 1 && candidates[0]!.id === 0) {
    await delay(300, undefined, { signal });
    return;
  }
  const frame = ++state.decisions;
  const imagePath = recorder.decisionImagePath(frame);
  await atomicWrite(imagePath, before.image);
  const prompt = controller.prompt(input, candidates);
  const prediction = await decide(context, controller, {
    input,
    candidates,
    prompt,
    imagePath,
    featurePath: recorder.featurePath(frame),
  });
  if (prediction.error) {
    if (++state.errors >= 3) throw prediction.error;
    return;
  }
  const output = prediction.output!;
  const selected = candidates.find((action) => action.id === Number(JSON.parse(output.text).choice));
  if (!selected) throw new Error('Counterpush 정책이 후보 밖의 행동을 반환했습니다.');
  const projection = () => {
    if (controller.version !== 3) return null;
    const description = decisionContext(
      profile,
      before.cards,
      before.state.elixir,
      candidates,
      before.situation,
    );
    const action = description.actions[candidates.indexOf(selected)];
    if (!action) throw new Error('선택한 행동의 피해 예측 문맥이 없습니다.');
    return decisionProjection(description, action);
  };
  await recorder.event({
    type: 'prediction',
    frame,
    image: imagePath,
    candidates,
    prompt,
    situation: before.situation,
    projection: projection(),
    perceptionMs: before.perceptionMs,
    captureToDecisionMs: Date.now() - before.capturedAt,
    ...output,
  });
  if ((await browser.phase()) !== 'battle') return;
  if (controller.deadlineMs !== null && output.elapsedMs > controller.deadlineMs) {
    await recorder.event({
      type: 'rejected',
      frame,
      reason: 'decision_deadline_exceeded',
      elapsedMs: output.elapsedMs,
    });
    return;
  }
  const latest = await controller.latestFrame(context.sensor, before);
  if (controller.newGraveyard(before, latest)) {
    await recorder.event({ type: 'rejected', frame, reason: 'new_graveyard_since_decision_frame' });
    return;
  }
  const decision = { frame, selected, before, latest };
  await match(selected)
    .with({ kind: 'ability' }, () => useHeroAbility(context, decision))
    .with({ slot: 0 }, () =>
      recorder.event(
        waitCheckEvent({ frame, valid: latest.state.battle && Date.now() - before.capturedAt < 8000 }),
      ),
    )
    .otherwise(() => playCard(context, decision));
}

export async function playCounterpushEpisode(options: {
  browser: CounterpushBrowser;
  controller: Controller;
  vision: CounterpushVisionClient;
  dataDir: string;
  profile: Profile;
  signal: AbortSignal;
  report: (status: Record<string, unknown>) => Promise<void>;
  patterns?: SpawnPatterns;
  persistPatterns?: boolean;
}) {
  const { browser, controller, profile, signal } = options;
  const recorder = await MatchRecorder.create(options.dataDir);
  const state = newMatchState();
  const sensor = await MatchSensor.open({
    browser,
    vision: options.vision,
    profile,
    recorder,
    state,
    fastCapture: controller.fastCapture,
    signal,
    patterns: options.patterns,
    report: options.report,
  });
  const context: InputContext = { browser, sensor, recorder, state, profile, signal };
  const initialPhase = await browser.phase();
  await browser.startMatch();
  await recorder.event({
    type: 'match_start',
    source: 'counterpush_visible_browser',
    deck: COUNTERPUSH_DECK,
    initialPhase,
    controllerVersion: controller.version,
  });
  const deadline = Date.now() + 900_000;
  try {
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      const phase = await browser.phase();
      if (phase === 'battle') state.waitingSince = 0;
      if (phase !== 'battle') {
        if (!state.waitingSince) state.waitingSince = Date.now();
        if (Date.now() - state.waitingSince > 45_000)
          throw new Error(`대전/결과 화면을 45초 동안 확인하지 못했습니다: ${phase}`);
        if (Date.now() - state.waitingReportedAt > 5000) {
          state.waitingReportedAt = Date.now();
          await options.report({
            phase: phase === 'result' ? 'waiting_for_result' : 'waiting_for_battle',
            episode: recorder.directory,
            waitingMs: Date.now() - state.waitingSince,
          });
        }
      }
      if (phase === 'result') {
        const first = await browser.result();
        await delay(600, undefined, { signal });
        const second = await browser.result();
        if (first && second && first.label === second.label && state.seenBattle) {
          Object.assign(state, second, { result: second.outcome });
          await browser.screenshot(recorder.resultPagePath);
          await recorder.event(resultEvent({ first, second }));
          break;
        }
      }
      if (phase !== 'battle') {
        await delay(300, undefined, { signal });
        continue;
      }
      if (state.inputSuspended) {
        await sensor.capture();
        await delay(500, undefined, { signal });
        continue;
      }
      const before = await sensor.capture();
      if (!before.state.battle || before.elixirConfidence < 0.9) {
        await delay(200, undefined, { signal });
        continue;
      }
      await decideAndAct(context, controller, before);
    }
  } finally {
    sensor.dynamics.finishOldEffects(Date.now(), true);
    if (options.persistPatterns !== false) await options.patterns?.save();
    const selected = [...COUNTERPUSH_DECK].flatMap((card) =>
      sensor.observations
        .filter((item) => item.card === card)
        .toSorted((first, second) => second.confidence - first.confidence)
        .slice(0, 2),
    );
    await recorder.observations({
      version: 1,
      source: 'counterpush_live_screen',
      actor: 'red_top',
      annotation: 'automatic_dino_tracking',
      deck: COUNTERPUSH_DECK,
      crop: { x: 0, y: 0, width: 368, height: 652 },
      observations: selected,
    });
    await recorder.summary({
      ...state,
      opponentActions: sensor.observations.length,
      elapsedMs: Date.now() - state.startedAt,
    });
  }
  return {
    directory: recorder.directory,
    result: state.result,
    blue: state.blue,
    red: state.red,
    actions: state.actions,
    confirmed: state.confirmed,
    abilityActions: state.abilityActions,
    abilityConfirmed: state.abilityConfirmed,
    seenBattle: state.seenBattle,
    opponentActions: sensor.observations.length,
    learningEligible: !state.inputSuspended,
  };
}
