import { appendFile, mkdir, readFile, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import type { AdbDevice } from '../adb.ts';
import { atomicWrite } from '../assets.ts';
import type { Profile } from '../config.ts';
import { runQwen } from '../qwen-runner.ts';
import { SharedInferenceClient } from '../qwen/shared-inference.ts';
import { acquireLearningLock, returnToLobby } from '../selfplay.ts';
import { trophyPrompt } from './decision.ts';

export async function runTrophy(options: {
  dataDir: string;
  device: AdbDevice;
  profile: Profile;
  matches: number;
  hours: number;
  signal: AbortSignal;
}) {
  const { dataDir, device, profile, signal } = options;
  const control = join(dataDir, 'trophy/control');
  await mkdir(join(dataDir, 'trophy/runs'), { recursive: true, mode: 0o700 });
  const lock = await acquireLearningLock(control);
  const client = new SharedInferenceClient(dataDir);
  const state = {
    ...lock.owner,
    phase: 'waiting_model',
    completed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    actions: 0,
    confirmed: 0,
    startedAt: new Date().toISOString(),
  };
  const report = async (update: Record<string, unknown>) => {
    Object.assign(state, update, {
      updatedAt: new Date().toISOString(),
      learning: false,
      policyRole: 'experimental_private_snapshot',
    });
    await atomicWrite(join(control, 'status.json'), JSON.stringify(state, null, 2) + '\n');
  };
  const until = options.hours ? Date.now() + options.hours * 3_600_000 : Infinity;
  const stopped = async () => {
    const stop = (await readFile(join(control, 'stop.json'), 'utf8')
      .then(JSON.parse)
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      })) as { id?: string } | null;
    return (
      signal.aborted ||
      Date.now() >= until ||
      (options.matches > 0 && state.completed >= options.matches) ||
      stop?.id === lock.owner.id
    );
  };
  try {
    await report({});
    while (!(await stopped())) {
      await report({ phase: 'waiting_model' });
      const policy = await client.policy().catch(async (error: NodeJS.ErrnoException) => {
        if (!['ENOENT', 'ECONNREFUSED', 'ECONNRESET'].includes(error.code ?? '')) throw error;
        await report({ stopReason: 'model_owner_unavailable' });
        return undefined;
      });
      if (policy === undefined) break;
      if (!policy) {
        await delay(1000, undefined, { signal });
        continue;
      }
      const disk = await statfs(dataDir);
      if (disk.bavail * disk.bsize < 8 * 1024 ** 3) throw new Error('남은 디스크가 8GB 미만입니다.');
      const directory = join(dataDir, 'trophy/runs', new Date().toISOString().replaceAll(':', '-'));
      await atomicWrite(
        join(directory, 'qualification.json'),
        JSON.stringify({
          role: 'trophy_observation',
          usedForTraining: false,
          usedForQualification: false,
          policy,
        }) + '\n',
      );
      await report({
        phase: 'playing',
        directory,
        policy,
        progress: { frames: 0, actions: 0, confirmed: 0 },
      });
      const episode = await runQwen({
        device,
        profile,
        dataDir,
        signal,
        client: {
          ready: async () => {},
          infer: async () => {
            throw new Error('공유 모델은 대전 판단만 지원합니다.');
          },
        },
        seconds: 600,
        maxActions: 200,
        live: true,
        startMatch: true,
        runDirectory: directory,
        maxDecisionMs: 1000,
        readOnlyDecisions: true,
        decisionPrompt: (cards, elixir, actions, threats) =>
          trophyPrompt(profile, cards, elixir, actions, threats),
        decision: (request) => client.choose(request, policy.checkpoint),
        onProgress: (progress) => report({ progress }),
      });
      if (!episode || !['win', 'loss', 'draw'].includes(episode.result))
        throw new Error('트로피 경기 결과를 확인하지 못해 다음 매칭을 중단했습니다.');
      state.completed++;
      state.actions += episode.actions;
      state.confirmed += episode.confirmed;
      if (episode.result === 'win') state.wins++;
      if (episode.result === 'loss') state.losses++;
      if (episode.result === 'draw') state.draws++;
      await appendFile(
        join(control, 'matches.jsonl'),
        JSON.stringify({ ...episode, policy, learning: false, at: new Date().toISOString() }) + '\n',
        { mode: 0o600 },
      );
      await report({ phase: 'returning', lastResult: episode.result });
      await returnToLobby(device, profile, dataDir, signal);
    }
    await report({ phase: 'stopped' });
  } catch (error) {
    await report({ phase: signal.aborted ? 'interrupted' : 'failed', error: String(error) });
    if (!signal.aborted) throw error;
  } finally {
    await lock.release();
  }
  return state;
}
