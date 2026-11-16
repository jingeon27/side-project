import { appendFile, readFile, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { LearningClient, type TrainingReport } from '../../qwen/learning-client.ts';
import { selectModel, type ModelId } from '../../qwen/model-options.ts';
import { atomicWrite } from '../../shared/assets.ts';
import type { Profile } from '../../shared/config.ts';
import { acquireLearningLock } from '../../shared/runtime-lock.ts';
import { sourcePoint, type AdbDevice } from '../device/adb.ts';
import { readBattleResult } from '../perception/result.ts';
import { crop, difference, fingerprint, normalize } from '../perception/vision.ts';
import { runQwen } from './qwen-runner.ts';

export type Episode = {
  directory: string;
  result: string;
  actions: number;
  confirmed: number;
  seenBattle: boolean;
};

// Owns the match -> reward -> weight update ordering. No next match on unknown results.
export async function learningLoop(options: {
  matches: number;
  until: number;
  signal: AbortSignal;
  stopped: () => Promise<boolean>;
  play: () => Promise<Episode>;
  train: (episode: Episode) => Promise<TrainingReport>;
  returnToLobby: () => Promise<void>;
  report: (state: Record<string, unknown>) => Promise<void>;
}) {
  const state = { completed: 0, updates: 0 };
  while (
    !options.signal.aborted &&
    Date.now() < options.until &&
    (!options.matches || state.completed < options.matches)
  ) {
    if (await options.stopped()) break;
    await options.report({ ...state, phase: 'playing' });
    const episode = await options.play();
    state.completed++;
    if (!['win', 'loss', 'draw'].includes(episode.result))
      throw new Error('경기 결과가 확인되지 않아 학습과 다음 매칭을 멈췄습니다.');
    options.signal.throwIfAborted();
    await options.report({ ...state, phase: 'training', episode });
    const training = await options.train(episode);
    if (training.updated) state.updates++;
    await options.report({ ...state, phase: 'returning', episode, training });
    await options.returnToLobby();
    await options.report({ ...state, phase: 'ready', episode, training });
  }
  return state;
}

export async function returnToLobby(
  device: AdbDevice,
  profile: Profile,
  dataDir: string,
  signal: AbortSignal,
) {
  const first = await normalize(await device.screenshot(), profile);
  if (!(await readBattleResult(first.image)))
    throw new Error('결과 화면을 확인하지 못해 복귀 버튼을 누르지 않았습니다.');
  await device.tap(sourcePoint({ x: 240, y: 594 }, first.viewport));
  const reference = await fingerprint(await readFile(join(dataDir, 'qwen/lobby-button.png')));
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await delay(500, undefined, { signal });
    const current = await normalize(await device.screenshot(), profile);
    if (
      (await device.isGameForeground()) &&
      difference(
        await fingerprint(await crop(current.image, { x: 130, y: 480, width: 110, height: 40 })),
        reference,
      ) < 8
    )
      return;
  }
  throw new Error('로비 복귀를 확인하지 못해 다음 매칭을 멈췄습니다.');
}

export async function runSelfPlay(options: {
  device: AdbDevice;
  profile: Profile;
  dataDir: string;
  matches: number;
  hours: number;
  signal: AbortSignal;
  model: ModelId;
}) {
  const directory = join(options.dataDir, 'qwen/selfplay');
  const lock = await acquireLearningLock(directory);
  const spec = selectModel(options.model, true);
  const client = new LearningClient(options.dataDir, options.model);
  const status = {
    id: lock.owner.id,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    model: spec.name,
    ...({ completed: 0, updates: 0, phase: 'loading' } as Record<string, unknown>),
  };
  const report = async (value: Record<string, unknown>) => {
    Object.assign(status, value, { updatedAt: new Date().toISOString() });
    await atomicWrite(join(directory, 'status.json'), JSON.stringify(status, null, 2) + '\n');
    await appendFile(join(directory, 'events.jsonl'), JSON.stringify({ ...value, at: Date.now() }) + '\n', {
      mode: 0o600,
    });
  };
  const abort = () => client.close();
  options.signal.addEventListener('abort', abort, { once: true });
  try {
    await report({ phase: 'loading' });
    await client.ready();
    await report({ policy: await client.status() });
    const completed = await learningLoop({
      matches: options.matches,
      until: Date.now() + options.hours * 3600_000,
      signal: options.signal,
      stopped: async () => {
        const stop = await readFile(join(directory, 'stop.json'), 'utf8').catch((error) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
          throw error;
        });
        return stop ? JSON.parse(stop).id === lock.owner.id : false;
      },
      play: async () => {
        const disk = await statfs(options.dataDir);
        if (disk.bavail * disk.bsize < 8 * 1024 ** 3)
          throw new Error('남은 디스크가 8GB 미만이라 새 대전을 시작하지 않았습니다.');
        const result = await runQwen({
          ...options,
          client,
          seconds: 600,
          maxActions: 200,
          live: true,
          startMatch: true,
          decision: (request) => client.choose(request),
          onProgress: (progress) => report({ phase: 'playing', progress }),
        });
        if (!result) throw new Error('대전 기록이 없습니다.');
        return result;
      },
      train: async (episode) => {
        const training = await client.train(episode.directory);
        const summaryPath = join(episode.directory, 'summary.json');
        const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Record<string, unknown>;
        await atomicWrite(summaryPath, JSON.stringify({ ...summary, training }, null, 2) + '\n');
        const policy = await client.status();
        await report({ policy, training });
        console.log(
          `학습 ${training.updated ? '적용' : '건너뜀'} · 버전 ${String(policy.version)} · 자료 ${training.samples ?? 0}개`,
        );
        return training;
      },
      returnToLobby: () => returnToLobby(options.device, options.profile, options.dataDir, options.signal),
      report,
    });
    await report({ ...completed, phase: 'stopped' });
    return completed;
  } catch (error) {
    await report({ phase: options.signal.aborted ? 'interrupted' : 'failed', error: String(error) });
    throw error;
  } finally {
    options.signal.removeEventListener('abort', abort);
    client.close();
    await lock.release();
  }
}
