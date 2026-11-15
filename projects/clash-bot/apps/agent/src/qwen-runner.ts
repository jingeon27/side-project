import { randomInt } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import sharp from 'sharp';

import { sourcePoint, type AdbDevice } from './adb.ts';
import { atomicWrite } from './assets.ts';
import { center, type CardId, type Profile } from './config.ts';
import type { DecisionOutput, LearningDecisionRequest } from './learning-client.ts';
import { actionCandidates, choicePrompt } from './qwen-actions.ts';
import { QwenClient } from './qwen-client.ts';
import { exportEpisode } from './qwen-dataset.ts';
import {
  parsePrediction,
  qwenOutputSchema,
  validateQwenAction,
  type FreshBattle,
  type QwenPrediction,
} from './qwen-policy.ts';
import { readBattleResult } from './result.ts';
import {
  analyze,
  crop,
  difference,
  fingerprint,
  loadTemplates,
  normalize,
  readElixir,
  type Templates,
} from './vision.ts';

export async function inspectQwenFrame(
  bytes: Buffer,
  profile: Profile,
  marker: number[],
  capturedAt = Date.now(),
  templates?: Templates,
) {
  const { image, viewport } = await normalize(bytes, profile);
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  const elixir = readElixir(
    { data, width: info.width, height: info.height, channels: info.channels },
    profile.elixir,
  );
  const markerDistance = difference(await fingerprint(await crop(image, profile.marker)), marker);
  const hand = await Promise.all(profile.hand.map(async (rect) => fingerprint(await crop(image, rect))));
  const observation = templates ? await analyze(bytes, profile, templates, capturedAt) : null;
  const cards = observation?.hand.map((card) => card.card) ?? [null, null, null, null];
  const state: FreshBattle = {
    battle:
      observation?.inBattle ??
      (markerDistance <= profile.thresholds.markerDistance && elixir.confidence >= 0.9 && elixir.value > 0),
    elixir: elixir.value,
    hand,
    capturedAt,
  };
  return {
    image,
    viewport,
    state,
    cards,
    threats: observation?.enemies.filter((enemy) => enemy.y > profile.riverY) ?? [],
    markerDistance,
    elixirConfidence: elixir.confidence,
  };
}

export async function runQwen(options: {
  device: AdbDevice;
  client: QwenClient;
  profile: Profile;
  dataDir: string;
  seconds: number;
  live: boolean;
  startMatch: boolean;
  maxActions: number;
  signal: AbortSignal;
  image?: string;
  decision?: (request: LearningDecisionRequest) => Promise<DecisionOutput>;
  onProgress?: (progress: { frames: number; actions: number; confirmed: number }) => Promise<void>;
}): Promise<
  { directory: string; result: string; actions: number; confirmed: number; seenBattle: boolean } | undefined
> {
  const { device, client, profile, dataDir, signal } = options;
  const directory = join(dataDir, 'qwen/runs', new Date().toISOString().replaceAll(':', '-'));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const log = async (entry: Record<string, unknown>) =>
    appendFile(join(directory, 'events.jsonl'), JSON.stringify(entry) + '\n', { mode: 0o600 });
  const templates = await loadTemplates(dataDir, profile);
  const marker = templates.marker;
  const state = {
    startedMatch: false,
    seenBattle: false,
    frames: 0,
    actions: 0,
    confirmed: 0,
    result: 'unknown',
    consecutiveErrors: 0,
  };
  const capture = async () =>
    inspectQwenFrame(await device.screenshot(), profile, marker, Date.now(), templates);
  const infer = async (
    image: Buffer,
    index: string,
    battle: boolean,
    elixir: number,
    cards: Array<CardId | null>,
    threats: Array<{ x: number; y: number }>,
  ) => {
    const path = join(directory, index + '.png');
    await atomicWrite(path, image);
    const legal = actionCandidates(profile, cards, elixir, threats);
    const candidates = options.decision
      ? legal
          .map((action) => ({ action, key: randomInt(2 ** 32) }))
          .toSorted((a, b) => a.key - b.key)
          .map((item) => item.action)
      : legal;
    const instruction = battle
      ? choicePrompt(cards, elixir, threats, candidates, options.decision ? 'letter' : 'json')
      : 'Classify this game screen. Only a live battle has a bottom row of FOUR playable hand cards and a purple elixir bar. Home lobby has a large yellow Battle button. Collection, trophy road rewards, loading and menus are unknown. Return ONLY JSON: {"phase":"lobby|result|unknown|battle","hand":[null,null,null,null],"elixir":0,"slot":0,"x":0,"y":0,"outcome":"unknown"}. On a result read win/loss/draw; no other actions.';
    const schema = battle
      ? {
          type: 'object',
          properties: { choice: { type: 'integer', enum: candidates.map((a) => a.id) } },
          required: ['choice'],
          additionalProperties: false,
        }
      : qwenOutputSchema(profile, false, 0, cards);
    const output =
      battle && options.decision
        ? await options.decision({
            imagePath: path,
            prompt: instruction,
            candidates,
            featurePath: join(directory, 'features', index + '.npz'),
          })
        : await client.infer([path], instruction, schema);
    await log({ type: 'raw_prediction', frame: index, ...output });
    const selected = battle ? candidates.find((a) => a.id === Number(JSON.parse(output.text).choice)) : null;
    if (battle && !selected) throw new Error('Qwen이 제안 목록 밖의 행동을 골랐습니다.');
    const prediction: QwenPrediction = selected
      ? {
          phase: 'battle',
          hand: cards,
          elixir,
          slot: selected.slot,
          x: selected.target.x / 368,
          y: selected.target.y / 652,
          outcome: 'unknown',
        }
      : parsePrediction(output.text);
    await log({
      type: 'prediction',
      image: path,
      prediction,
      prompt: instruction,
      candidates: battle ? candidates : [],
      ...output,
      at: Date.now(),
    });
    console.log(
      `${prediction.phase} · ${output.elapsedMs}ms · elixir=${prediction.elixir} · hand=${prediction.hand.join(',')} · slot=${prediction.slot}`,
    );
    return prediction;
  };
  console.log(`Qwen 준비 중. 기록: ${directory}`);
  await client.ready();
  const warm = options.image
    ? await inspectQwenFrame(await readFile(options.image), profile, marker, Date.now(), templates)
    : await capture();
  if (!options.decision)
    await infer(warm.image, 'warmup', warm.state.battle, warm.state.elixir, warm.cards, warm.threats);
  if (options.image) return;
  if (options.live && options.startMatch) {
    const button = { x: 130, y: 480, width: 110, height: 40 };
    const reference = await fingerprint(await readFile(join(dataDir, 'qwen/lobby-button.png')));
    const current = await capture();
    const lobbyMatches = difference(await fingerprint(await crop(current.image, button)), reference) < 8;
    if (!(await device.isGameForeground()) || current.state.battle || !lobbyMatches)
      throw new Error('로비 화면을 확인하지 못해 매칭을 시작하지 않았습니다.');
    await device.tap(sourcePoint({ x: 184, y: 503 }, (await capture()).viewport));
    state.startedMatch = true;
  }
  const started = Date.now();
  try {
    for (const iteration of Array.from({ length: options.seconds * 2 })) {
      void iteration;
      if (
        signal.aborted ||
        Date.now() - started > options.seconds * 1000 ||
        state.actions >= options.maxActions
      )
        break;
      if (!(await device.isGameForeground())) {
        await delay(500, undefined, { signal });
        continue;
      }
      const before = await capture();
      state.frames++;
      if (state.frames % 10 === 0)
        await options.onProgress?.({
          frames: state.frames,
          actions: state.actions,
          confirmed: state.confirmed,
        });
      const result = await readBattleResult(before.image);
      if (result) {
        if (options.decision) {
          await delay(500, undefined, { signal });
          const second = await readBattleResult((await capture()).image);
          if (!second || second.blue !== result.blue || second.red !== result.red) continue;
        }
        state.result = result.outcome;
        const path = join(directory, 'result.png');
        await atomicWrite(path, before.image);
        await log({
          type: 'result',
          ...result,
          image: path,
          source: options.decision ? 'crown_pixels_verified2' : 'crown_pixels',
          reward: result.outcome === 'win' ? 1 : result.outcome === 'loss' ? -1 : 0,
        });
        break;
      }
      if (before.state.battle) state.seenBattle = true;
      if (options.decision && !before.state.battle) {
        await delay(500, undefined, { signal });
        continue;
      }
      const prediction = await infer(
        before.image,
        String(state.frames).padStart(4, '0'),
        before.state.battle,
        before.state.elixir,
        before.cards,
        before.threats,
      ).catch(async (error) => {
        state.consecutiveErrors++;
        await log({ type: 'inference_error', message: String(error), count: state.consecutiveErrors });
        console.log(`Qwen 판단 재시도: ${String(error)}`);
        if (state.consecutiveErrors >= 3) throw error;
        return null;
      });
      if (!prediction) continue;
      if (state.seenBattle && !before.state.battle && prediction.phase === 'lobby') {
        const reference = await fingerprint(await readFile(join(dataDir, 'qwen/lobby-button.png')));
        if (
          difference(
            await fingerprint(await crop(before.image, { x: 130, y: 480, width: 110, height: 40 })),
            reference,
          ) < 8
        )
          break;
      }
      if (!options.live || prediction.phase !== 'battle') continue;
      if (prediction.slot === 0) {
        if (options.decision) {
          const latest = await capture();
          await log({
            type: 'wait_check',
            frame: state.frames,
            valid: latest.state.battle && Date.now() - before.state.capturedAt < 8000,
          });
          await delay(500, undefined, { signal });
        }
        continue;
      }
      const latest = await capture();
      const action = validateQwenAction(prediction, before.state, latest.state, profile, Date.now());
      if (!action) {
        await log({
          type: 'rejected',
          prediction,
          elapsedMs: Date.now() - before.state.capturedAt,
          before: { battle: before.state.battle, elixir: before.state.elixir, marker: before.markerDistance },
          latest: { battle: latest.state.battle, elixir: latest.state.elixir, marker: latest.markerDistance },
        });
        console.log('재확인 조건 불충족: 입력 대기');
        continue;
      }
      signal.throwIfAborted();
      await device.tap(sourcePoint(center(profile.hand[action.slot]!), latest.viewport));
      await delay(100, undefined, { signal });
      await device.tap(sourcePoint(action.target, latest.viewport));
      state.actions++;
      console.log(`배치 ${state.actions}: ${action.card} (${action.target.x},${action.target.y})`);
      await log({ type: 'input_sent', action, frame: state.frames, at: Date.now() });
      await delay(700, undefined, { signal });
      const after = await capture();
      const changed = difference(latest.state.hand[action.slot]!, after.state.hand[action.slot]!) > 15;
      const spent = latest.state.elixir - after.state.elixir;
      if (changed && spent >= 1) state.confirmed++;
      await log({ type: 'input_check', changed, spent, action, frame: state.frames, at: Date.now() });
      state.consecutiveErrors = 0;
    }
  } finally {
    await atomicWrite(
      join(directory, 'summary.json'),
      JSON.stringify(
        {
          ...state,
          elapsedMs: Date.now() - started,
          learning: options.decision
            ? 'on-policy episode; post-match adapter update is recorded in training.json'
            : 'recorded trajectories only; model weights unchanged',
        },
        null,
        2,
      ) + '\n',
    );
    const exported = await exportEpisode(directory, state.result);
    console.log(
      options.decision
        ? `경기 기록 ${exported}개 저장. 결과에 따른 학습 대기 중.`
        : `학습용 실전 기록 ${exported}개 저장 (가중치 변경 없음).`,
    );
    console.log(JSON.stringify(state));
  }
  return {
    directory,
    result: state.result,
    actions: state.actions,
    confirmed: state.confirmed,
    seenBattle: state.seenBattle,
  };
}
