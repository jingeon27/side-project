import { randomInt } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { analyze, crop, difference, fingerprint, loadTemplates } from '../../android/perception/vision.ts';
import { actionCandidates, choicePrompt } from '../../android/policy/qwen-actions.ts';
import {
  validateQwenAction,
  type FreshBattle,
  type QwenPrediction,
} from '../../android/policy/qwen-policy.ts';
import { type LearningClient } from '../../qwen/learning-client.ts';
import { atomicWrite } from '../../shared/assets.ts';
import { CARD_INFO, type Profile } from '../../shared/config.ts';
import { BattleMemory, type BattleSituation } from '../domain/battle-state.ts';
import { FieldDynamics } from '../domain/field-dynamics.ts';
import type { SpawnPatterns } from '../domain/spawn-patterns.ts';
import { type OpponentObservation } from '../learning/opponent-data.ts';
import { counterpushBarReading, counterpushElixir, plausibleSpend } from '../perception/elixir.ts';
import { abilityInputCheck, canUseHeroAbility, HeroAbilityButton } from '../perception/hero-ability.ts';
import { OpponentTracker } from '../perception/tracker.ts';
import { type CounterpushVisionClient, type UnitScan } from '../perception/vision-client.ts';
import { candidatesV2, compactPrompt } from '../policy/decision-v2.ts';
import { fastPrompt } from '../policy/decision-v3.ts';
import { COUNTERPUSH_DECK, COUNTERPUSH_EVOLUTIONS, CounterpushBrowser } from './browser.ts';
import type { DecisionGate } from './parallel-loop.ts';

type OwnFrame = {
  image: Buffer;
  capturedAt: number;
  path: string;
  state: FreshBattle;
  cards: Array<Profile['deck'][number] | null>;
  elixirConfidence: number;
  scan: UnitScan;
  situation: BattleSituation;
  perceptionMs: number;
  graveyardPresence: [number, number];
};

export async function playCounterpushEpisode(options: {
  browser: CounterpushBrowser;
  client: LearningClient;
  vision: CounterpushVisionClient;
  dataDir: string;
  profile: Profile;
  signal: AbortSignal;
  report: (status: Record<string, unknown>) => Promise<void>;
  patterns?: SpawnPatterns;
  decisionGate?: DecisionGate;
  tab?: number;
  persistPatterns?: boolean;
}) {
  const { browser, client, vision, dataDir, profile, signal } = options;
  const policy = await client.status();
  const controllerVersion: 1 | 2 | 3 =
    policy.controller_version === 3 ? 3 : policy.controller_version === 2 ? 2 : 1;
  const directory = join(
    dataDir,
    'counterpush/runs',
    new Date().toISOString().replaceAll(':', '-') +
      (options.tab === undefined ? '' : `-tab${options.tab + 1}`),
  );
  await mkdir(join(directory, 'frames'), { recursive: true, mode: 0o700 });
  const templates = await loadTemplates(dataDir, profile);
  const tracker = new OpponentTracker();
  const observations: OpponentObservation[] = [];
  const memory = new BattleMemory([...COUNTERPUSH_DECK], COUNTERPUSH_EVOLUTIONS);
  const abilityButton = await HeroAbilityButton.load();
  const dynamics = new FieldDynamics(directory, options.patterns);
  const situations = new Map<string, BattleSituation>();
  const state = {
    frames: 0,
    actions: 0,
    confirmed: 0,
    abilityActions: 0,
    abilityConfirmed: 0,
    decisions: 0,
    errors: 0,
    seenBattle: false,
    result: 'unknown',
    blue: 0,
    red: 0,
    startedAt: Date.now(),
    inputPending: false,
    firstBattleAt: 0,
    unconfirmed: 0,
    waitingSince: 0,
    waitingReportedAt: 0,
    inputSuspended: false,
  };
  const log = (row: Record<string, unknown>) =>
    appendFile(join(directory, 'events.jsonl'), JSON.stringify({ ...row, at: Date.now() }) + '\n', {
      mode: 0o600,
    });
  const readOwn = async () => {
    const started = performance.now();
    signal.throwIfAborted();
    const screenshot = await browser.capture(controllerVersion === 3);
    const path = join(directory, 'frames', `${String(++state.frames).padStart(6, '0')}.png`);
    await atomicWrite(path, screenshot.image);
    const [analyzed, bar, ability] = await Promise.all([
      analyze(screenshot.image, profile, templates, screenshot.capturedAt, {
        fieldMarkers: controllerVersion < 3,
      }),
      counterpushBarReading(screenshot.image, profile),
      abilityButton.read(screenshot.image, screenshot.capturedAt),
    ]);
    const observation = { ...analyzed, ...bar };
    const elixir = counterpushElixir(observation, profile);
    const fresh = {
      battle: (await browser.phase()) === 'battle',
      elixir: elixir.value,
      capturedAt: screenshot.capturedAt,
      hand: await Promise.all(
        profile.hand.map(async (rectangle) => fingerprint(await crop(screenshot.image, rectangle))),
      ),
    };
    return {
      started,
      screenshot,
      path,
      observation,
      ability,
      elixir,
      fresh,
      cards: observation.hand.map((card) => card.card),
    };
  };
  const capture = async (): Promise<OwnFrame> => {
    const { started, screenshot, path, observation, ability, elixir, fresh, cards } = await readOwn();
    const scan = await vision.scan(path);
    const field = dynamics.observe(scan, screenshot.capturedAt);
    await appendFile(
      join(directory, 'vision.jsonl'),
      JSON.stringify({
        image: path,
        capturedAt: screenshot.capturedAt,
        scan,
        hand: observation.hand.map((card) => card.card),
        elixir: elixir.value,
        elixirAmount: elixir.amount,
        rawElixir: observation.elixir,
        elixirConfidence: observation.elixirConfidence,
      }) + '\n',
      { mode: 0o600 },
    );
    const situation = memory.observe({
      at: screenshot.capturedAt,
      amount: elixir.amount,
      hand: cards,
      inputPending: state.inputPending,
      elixirReliable: observation.elixirConfidence >= 0.9,
      elixirRange: elixir.range,
      allies: field.allies,
      enemies: field.enemies,
      effects: field.effects,
      spawners: field.spawners,
      ability,
    });
    situation.own.elixir =
      !state.inputPending && observation.elixirConfidence >= 0.9 ? elixir.range : { min: 0, max: 10 };
    if (observation.elixirConfidence < 0.9) situation.opponent.elixir = { min: 0, max: 10 };
    situations.set(path, situation);
    for (const [key, value] of situations)
      if (screenshot.capturedAt - value.at > 12_000) situations.delete(key);
    if (fresh.battle) {
      if (!state.firstBattleAt) state.firstBattleAt = screenshot.capturedAt;
      if (
        state.actions === 0 &&
        screenshot.capturedAt - state.firstBattleAt > 15_000 &&
        fresh.elixir < 2 &&
        cards.filter(Boolean).length >= 2
      )
        throw new Error('시작 후 카드 지출 없이 엘릭서가 계속 0~1로 읽혀 인식을 재확인해야 합니다.');
      state.seenBattle = true;
      const accepted = tracker.update({ path, capturedAt: screenshot.capturedAt }, scan);
      for (const event of accepted) {
        const absence = event.grounding
          ? await vision.absent(
              event.before.image,
              event.card,
              event.grounding.box,
              Number(event.after.capturedAt) - Number(event.before.capturedAt),
            )
          : null;
        if (!absence?.absent) {
          await log({
            type: 'opponent_rejected',
            observation: event,
            reason: 'prior_presence_or_ambiguity',
            absence,
          });
          continue;
        }
        const beforeSituation = situations.get(event.before.image);
        if (!beforeSituation) {
          await log({ type: 'opponent_rejected', reason: 'missing_before_state', observation: event });
          continue;
        }
        const enriched = { ...event, situation: beforeSituation };
        observations.push(enriched);
        memory.opponentPlay(event.card, Number(event.before.capturedAt), screenshot.capturedAt);
        await log({ type: 'opponent_action', observation: enriched, absence });
      }
      // These plays are known by this frame's decision, while earlier stored
      // snapshots stay unchanged for training without future information.
      const ledger = memory.elixir.snapshot(screenshot.capturedAt);
      Object.assign(situation.opponent, {
        elixir:
          state.inputPending || observation.elixirConfidence < 0.9 ? { min: 0, max: 10 } : ledger.opponent,
        cycle: memory.opponentCycle.snapshot(),
        evolutions: memory.opponentEvolutions.snapshot(),
        seenSpent: ledger.opponentSeenSpent,
      });
    }
    await appendFile(
      join(directory, 'states.jsonl'),
      JSON.stringify({
        version: 1,
        image: path,
        capturedAt: screenshot.capturedAt,
        inputPending: state.inputPending,
        situation,
      }) + '\n',
      { mode: 0o600 },
    );
    if (state.frames % 5 === 0)
      await options.report({
        phase: 'playing',
        episode: directory,
        frames: state.frames,
        actions: state.actions,
        confirmed: state.confirmed,
        abilityActions: state.abilityActions,
        abilityConfirmed: state.abilityConfirmed,
        ability: situation.own.ability,
        opponentActions: observations.length,
        visionMs: scan.elapsed_ms,
        spawnedUnitsVisible: scan.spawnedUnits?.length ?? 0,
        learnedSpawnCasts: dynamics.patterns.casts.length,
        graveyardPhases: field.effects
          .filter((effect) => effect.card === 'graveyard')
          .map((effect) => ({
            x: effect.x,
            y: effect.y,
            visibleAgeMs: effect.visibleAgeMs,
            onsetCertain: effect.onsetCertain,
            predictedAppearances: effect.predictions?.length ?? 0,
          })),
      });
    return {
      ...screenshot,
      path,
      state: fresh,
      cards,
      elixirConfidence: observation.elixirConfidence,
      scan,
      situation,
      perceptionMs: Math.round(performance.now() - started),
      graveyardPresence: scan.graveyardPresence ?? [0, 0],
    };
  };
  const inputFrame = async (before: OwnFrame): Promise<OwnFrame> => {
    const { started, screenshot, path, observation, ability, elixir, fresh, cards } = await readOwn();
    const guard = await vision.guard(path);
    // Recheck input legality and new Graveyard pixels, without pretending a
    // repeated unit classification is a newly observed field.
    return {
      ...screenshot,
      path,
      state: fresh,
      cards,
      elixirConfidence: observation.elixirConfidence,
      scan: before.scan,
      perceptionMs: Math.round(performance.now() - started),
      graveyardPresence: guard.graveyardPresence,
      situation: {
        ...before.situation,
        own: { ...before.situation.own, hand: cards, elixir: elixir.range, ability },
      },
    };
  };
  const initialPhase = await browser.phase();
  await browser.startMatch();
  await log({
    type: 'match_start',
    source: 'counterpush_visible_browser',
    deck: COUNTERPUSH_DECK,
    tab: options.tab,
    initialPhase,
    controllerVersion,
  });
  const deadline = Date.now() + 900_000;
  try {
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      const phase = await browser.phase();
      if (phase === 'battle') state.waitingSince = 0;
      else {
        if (!state.waitingSince) state.waitingSince = Date.now();
        if (Date.now() - state.waitingSince > 45_000)
          throw new Error(`대전/결과 화면을 45초 동안 확인하지 못했습니다: ${phase}`);
        if (Date.now() - state.waitingReportedAt > 5000) {
          state.waitingReportedAt = Date.now();
          await options.report({
            phase: phase === 'result' ? 'waiting_for_result' : 'waiting_for_battle',
            episode: directory,
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
          await browser.screenshot(join(directory, 'result-page.png'));
          await log({
            type: 'result',
            blue: second.blue,
            red: second.red,
            outcome: second.outcome,
            source: 'counterpush_result_dom_verified2',
            readings: [first.label, second.label],
          });
          break;
        }
      }
      if (phase !== 'battle') {
        await delay(300, undefined, { signal });
        continue;
      }
      if (state.inputSuspended) {
        await capture();
        await delay(500, undefined, { signal });
        continue;
      }
      // Acquire the shared model before taking the decision image, so waiting
      // for another tab cannot age an image past its input validation deadline.
      const lease = { release: null as (() => void) | null, error: null as unknown };
      const pendingLease = options.decisionGate?.acquire(signal).then(
        (release) => {
          lease.release = release;
        },
        (error: unknown) => {
          lease.error = error;
        },
      );
      try {
        if (pendingLease) {
          while (!lease.release) {
            if (lease.error) throw lease.error;
            signal.throwIfAborted();
            if ((await browser.phase()) === 'battle') await capture();
            await delay(100, undefined, { signal });
          }
          await pendingLease;
        }
        const before = await capture();
        if (!before.state.battle || before.elixirConfidence < 0.9) {
          await delay(200, undefined, { signal });
          continue;
        }
        const threats = before.situation.opponent.units
          .filter((unit) => unit.y > profile.riverY)
          .map(({ x, y }) => ({ x, y }));
        const candidates = (controllerVersion >= 2 ? candidatesV2 : actionCandidates)(
          profile,
          before.cards,
          before.state.elixir,
          threats,
          before.situation,
        )
          .map((action) => ({ action, order: randomInt(2 ** 32) }))
          .toSorted((first, second) => first.order - second.order)
          .map(({ action }) => action);
        if (candidates.length === 1 && candidates[0]!.id === 0) {
          await delay(300, undefined, { signal });
          continue;
        }
        const frame = ++state.decisions;
        const imagePath = join(directory, String(frame).padStart(4, '0') + '.png');
        await atomicWrite(imagePath, before.image);
        const prompt =
          controllerVersion >= 2
            ? (controllerVersion === 3 ? fastPrompt : compactPrompt)(
                profile,
                before.cards,
                before.state.elixir,
                candidates,
                before.situation,
              )
            : choicePrompt(
                before.cards,
                before.state.elixir,
                threats,
                candidates,
                'letter',
                before.situation,
              );
        const prediction = {
          done: false,
          output: null as Awaited<ReturnType<LearningClient['choose']>> | null,
          error: null as unknown,
        };
        const pending = client
          .choose({
            imagePath,
            prompt,
            candidates,
            featurePath: join(directory, 'features', String(frame).padStart(4, '0') + '.npz'),
            controllerVersion,
          })
          .then((output) => {
            prediction.output = output;
          })
          .catch((error: unknown) => {
            prediction.error = error;
          })
          .finally(() => {
            prediction.done = true;
          });
        // Continue visual tracking while Qwen decides. There is only one policy
        // request at a time, and no browser input occurs until it is validated.
        while (controllerVersion < 3 && !prediction.done && (await browser.phase()) === 'battle') {
          await delay(350, undefined, { signal });
          if (!prediction.done) await capture();
        }
        await pending;
        lease.release?.();
        if (prediction.error) {
          if (++state.errors >= 3) throw prediction.error;
          continue;
        }
        const output = prediction.output!;
        const selected = candidates.find((action) => action.id === Number(JSON.parse(output.text).choice));
        if (!selected) throw new Error('Counterpush 정책이 후보 밖의 행동을 반환했습니다.');
        await log({
          type: 'prediction',
          frame,
          image: imagePath,
          candidates,
          prompt,
          situation: before.situation,
          perceptionMs: before.perceptionMs,
          captureToDecisionMs: Date.now() - before.capturedAt,
          ...output,
        });
        if ((await browser.phase()) !== 'battle') continue;
        if (controllerVersion === 3 && output.elapsedMs > 1000) {
          await log({
            type: 'rejected',
            frame,
            reason: 'decision_deadline_exceeded',
            elapsedMs: output.elapsedMs,
          });
          continue;
        }
        const latest = controllerVersion === 3 ? await inputFrame(before) : await capture();
        const newEffect =
          controllerVersion === 3
            ? latest.graveyardPresence.some(
                (pixels, index) => pixels >= 350 && before.graveyardPresence[index]! < 350,
              )
            : latest.situation.effects?.some(
                (effect) =>
                  effect.side === 'red' &&
                  effect.card === 'graveyard' &&
                  !before.situation.effects?.some(
                    (old) =>
                      old.side === effect.side &&
                      old.card === effect.card &&
                      Math.hypot(old.x - effect.x, old.y - effect.y) < 55,
                  ),
              );
        if (newEffect) {
          await log({ type: 'rejected', frame, reason: 'new_graveyard_since_decision_frame' });
          continue;
        }
        if (selected.kind === 'ability') {
          const beforeAbility = before.situation.own.ability;
          const latestAbility = latest.situation.own.ability;
          if (
            !canUseHeroAbility(beforeAbility, latestAbility, latest.state.elixir, Date.now()) ||
            latest.elixirConfidence < 0.9
          ) {
            await log({ type: 'rejected', frame, reason: 'ability_no_longer_ready' });
            continue;
          }
          state.inputPending = true;
          const sentAt = Date.now();
          if (!(await browser.activateAbility())) {
            state.inputPending = false;
            continue;
          }
          state.actions++;
          state.abilityActions++;
          await log({ type: 'ability_sent', frame, action: selected, sentAt });
          await delay(300, undefined, { signal });
          const checks: Array<{
            changed: boolean;
            handUnchanged: boolean;
            confirmed: boolean;
            spent: number;
          }> = [];
          for (const attempt of [0, 1, 2, 3]) {
            if (attempt) await delay(200, undefined, { signal });
            if ((await browser.phase()) !== 'battle') break;
            const after = await capture();
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
            abilityButton.markUsed(latestAbility!.instance);
            memory.ownAbility(sentAt, latestAbility!.instance);
            state.confirmed++;
            state.abilityConfirmed++;
            state.unconfirmed = 0;
          } else state.unconfirmed++;
          state.inputPending = false;
          await log({
            type: 'ability_check',
            frame,
            ...check,
            confirmed: check?.confirmed ?? false,
            expectedCost: 2,
            checks: checks.length,
            action: selected,
          });
          if (state.unconfirmed >= 3) {
            state.inputSuspended = true;
            await log({
              type: 'input_recovery',
              reason: 'three_unconfirmed_ability_inputs',
              learningEligible: false,
            });
          }
          state.errors = 0;
          continue;
        }
        if (selected.slot === 0) {
          await log({
            type: 'wait_check',
            frame,
            valid: latest.state.battle && Date.now() - before.capturedAt < 8000,
          });
          continue;
        }
        const choice: QwenPrediction = {
          phase: 'battle',
          hand: before.cards,
          elixir: before.state.elixir,
          slot: selected.slot,
          x: selected.target.x / 368,
          y: selected.target.y / 652,
          outcome: 'unknown',
        };
        const action = validateQwenAction(choice, before.state, latest.state, profile, Date.now());
        if (!action || latest.elixirConfidence < 0.9) {
          await log({ type: 'rejected', frame, reason: 'stale_or_changed_screen' });
          continue;
        }
        state.inputPending = true;
        const sentAt = Date.now();
        if (!(await browser.play(profile, selected.slot, selected.target))) {
          state.inputPending = false;
          continue;
        }
        state.actions++;
        await log({ type: 'input_sent', frame, action, sentAt });
        await delay(300, undefined, { signal });
        const checks: Array<{ after: OwnFrame; changed: boolean; spent: number; confirmed: boolean }> = [];
        for (const attempt of [0, 1, 2, 3]) {
          if (attempt) await delay(200, undefined, { signal });
          if ((await browser.phase()) !== 'battle') break;
          const after = await capture();
          const changed = difference(latest.state.hand[action.slot]!, after.state.hand[action.slot]!) > 15;
          const spent = latest.state.elixir - after.state.elixir;
          const cost = CARD_INFO[selected.card!].cost;
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
          memory.ownPlay(selected.card!, sentAt, action.target, check.after.cards);
          if (selected.card === 'ice_wizard') abilityButton.newDeployment();
        } else {
          state.unconfirmed++;
          memory.ownEvolutions.uncertain();
        }
        state.inputPending = false;
        await log({
          type: 'input_check',
          frame,
          changed: check?.changed ?? false,
          spent: check?.spent ?? 0,
          confirmed: check?.confirmed ?? false,
          expectedCost: CARD_INFO[selected.card!].cost,
          checks: checks.length,
          action,
        });
        if (state.unconfirmed >= 3) {
          state.inputSuspended = true;
          await log({
            type: 'input_recovery',
            reason: 'three_unconfirmed_card_inputs',
            learningEligible: false,
          });
        }
        state.errors = 0;
      } finally {
        // Also release if a tab ends, an input fails or shutdown interrupts it.
        if (pendingLease) await pendingLease.catch(() => {});
        lease.release?.();
      }
    }
  } finally {
    dynamics.finishOldEffects(Date.now(), true);
    if (options.persistPatterns !== false) await options.patterns?.save();
    const selected = [...COUNTERPUSH_DECK].flatMap((card) =>
      observations
        .filter((item) => item.card === card)
        .toSorted((first, second) => second.confidence - first.confidence)
        .slice(0, 2),
    );
    await atomicWrite(
      join(directory, 'observations.json'),
      JSON.stringify(
        {
          version: 1,
          source: 'counterpush_live_screen',
          actor: 'red_top',
          annotation: 'automatic_dino_tracking',
          deck: COUNTERPUSH_DECK,
          crop: { x: 0, y: 0, width: 368, height: 652 },
          observations: selected,
        },
        null,
        2,
      ) + '\n',
    );
    await atomicWrite(
      join(directory, 'summary.json'),
      JSON.stringify(
        { ...state, opponentActions: observations.length, elapsedMs: Date.now() - state.startedAt },
        null,
        2,
      ) + '\n',
    );
  }
  return {
    directory,
    result: state.result,
    actions: state.actions,
    confirmed: state.confirmed,
    abilityActions: state.abilityActions,
    abilityConfirmed: state.abilityConfirmed,
    seenBattle: state.seenBattle,
    opponentActions: observations.length,
    learningEligible: !state.inputSuspended,
  };
}
