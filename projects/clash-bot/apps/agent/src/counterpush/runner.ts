import { appendFile, mkdir, readFile, statfs } from 'node:fs/promises';
import { join } from 'node:path';

import { atomicWrite } from '../assets.ts';
import { type Profile } from '../config.ts';
import { LearningClient } from '../learning-client.ts';
import { selectModel, type ModelId } from '../model-options.ts';
import { acquireLearningLock } from '../selfplay.ts';
import { learningAudit } from './audit.ts';
import { CounterpushBrowser } from './browser.ts';
import { learnCounterpushEpisodes, playCounterpushEpisode } from './episode.ts';
import { DecisionGate, parallelLearningLoop } from './parallel-loop.ts';
import { SpawnPatterns } from './spawn-patterns.ts';
import { CounterpushVisionClient } from './vision-client.ts';

export async function runCounterpush(options: {
  dataDir: string;
  profile: Profile;
  model: ModelId;
  hours: number;
  matches: number;
  tabs?: number;
  signal: AbortSignal;
}) {
  const { dataDir, model, signal } = options;
  const control = join(dataDir, 'counterpush/control');
  await mkdir(control, { recursive: true, mode: 0o700 });
  const tabs = options.tabs ?? 1;
  if (![1, 2].includes(tabs)) throw new Error('동시 대전 탭은 1개 또는 2개로 설정합니다.');
  const lock = await acquireLearningLock(join(dataDir, 'qwen/selfplay'));
  const workers: Record<string, unknown>[] = Array.from({ length: tabs }, (_, tab) => ({
    tab: tab + 1,
    phase: 'idle',
  }));
  const state = {
    id: lock.owner.id,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    model: selectModel(model, true).name,
    phase: 'loading',
    completed: 0,
    updates: 0,
    tabs,
    workers,
  };
  const writes = { tail: Promise.resolve() };
  const report = (status: Record<string, unknown>) => {
    const write = writes.tail.then(async () => {
      Object.assign(state, status, { updatedAt: new Date().toISOString() });
      await atomicWrite(join(control, 'status.json'), JSON.stringify(state, null, 2) + '\n');
    });
    writes.tail = write.catch(() => {});
    return write;
  };
  const client = new LearningClient(dataDir, model);
  const vision = new CounterpushVisionClient(dataDir);
  const resources = { browsers: [] as CounterpushBrowser[], patterns: null as SpawnPatterns | null };
  const abort = () => {
    client.close();
    vision.close();
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    await report({ phase: 'loading' });
    await client.ready();
    await vision.ready();
    const patterns = await SpawnPatterns.open(join(dataDir, 'counterpush/patterns/graveyard.json'));
    resources.patterns = patterns;
    const browser = await CounterpushBrowser.open(dataDir);
    resources.browsers.push(browser);
    if (tabs === 2) resources.browsers.push(await browser.newTab());
    await report({ phase: 'ready', policy: await client.status() });
    const decisionGate = new DecisionGate();
    const result = await parallelLearningLoop({
      tabs,
      matches: options.matches,
      until: Date.now() + options.hours * 3_600_000,
      signal,
      stopped: async () => {
        const stop = await readFile(join(dataDir, 'qwen/selfplay/stop.json'), 'utf8').catch((error) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
          throw error;
        });
        return stop !== null && JSON.parse(stop).id === lock.owner.id;
      },
      play: async (tab) => {
        workers[tab] = {
          tab: tab + 1,
          phase: 'starting',
          frames: 0,
          actions: 0,
          confirmed: 0,
          abilityActions: 0,
          abilityConfirmed: 0,
          opponentActions: 0,
          waitingMs: 0,
        };
        await report({ workers: workers.map((worker) => ({ ...worker })) });
        const disk = await statfs(dataDir);
        if (disk.bavail * disk.bsize < 8 * 1024 ** 3)
          throw new Error('남은 디스크가 8GB 미만이어서 다음 대전을 멈췄습니다.');
        const episode = await playCounterpushEpisode({
          ...options,
          browser: resources.browsers[tab]!,
          client,
          vision,
          report: async (status) => {
            Object.assign(workers[tab]!, status);
            await report({ ...status, phase: 'playing', workers: workers.map((worker) => ({ ...worker })) });
          },
          patterns,
          persistPatterns: false,
          decisionGate,
          tab,
        }).catch(async (error: unknown) => {
          Object.assign(workers[tab]!, { phase: 'failed', error: String(error) });
          await report({ workers: workers.map((worker) => ({ ...worker })) });
          throw error;
        });
        Object.assign(workers[tab]!, {
          phase: 'waiting_for_training',
          episode: episode.directory,
          result: episode.result,
        });
        await report({ workers: workers.map((worker) => ({ ...worker })) });
        return episode;
      },
      train: async (episodes) => {
        await patterns.save();
        await report({ phase: 'training', batchEpisodes: episodes.map((episode) => episode.directory) });
        const trained = await learnCounterpushEpisodes(client, dataDir, episodes);
        for (const { episode, training } of trained) {
          await appendFile(
            join(control, 'matches.jsonl'),
            JSON.stringify({
              ...episode,
              opponentActions: episode.opponentActions,
              training,
              at: new Date().toISOString(),
            }) + '\n',
            { mode: 0o600 },
          );
        }
        const training = trained.at(-1)!.training;
        await report({
          phase: 'trained',
          policy: training.policy,
          training,
          lastResult: episodes.at(-1)!.result,
          lastEpisode: episodes.at(-1)!.directory,
          lastBatch: episodes,
          learningAudit: await learningAudit(dataDir, state.startedAt),
        });
        return {
          updated: trained.some((item) => item.training.updated),
          version: Number(training.policy.version),
        };
      },
      returnToLobby: async (tab) => {
        if ((await resources.browsers[tab]!.phase()) !== 'result')
          throw new Error('다음 대전 전 결과 화면을 확인하지 못했습니다.');
      },
      report: async (status) => {
        await report(status);
      },
    });
    await report({ ...result, phase: 'stopped' });
    return result;
  } catch (error) {
    for (const [tab, browser] of resources.browsers.entries())
      await browser.screenshot(join(control, `last-error-tab${tab + 1}.png`)).catch(() => {});
    await report({
      phase: signal.aborted ? 'interrupted' : 'failed',
      error: String(error),
      details: error instanceof AggregateError ? error.errors.map(String) : [],
    });
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
    client.close();
    vision.close();
    await resources.patterns?.save().catch(() => {});
    await resources.browsers[0]?.close().catch(() => {});
    await lock.release();
  }
}
