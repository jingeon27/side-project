import { appendFile, mkdir, readFile, statfs } from 'node:fs/promises';
import { join } from 'node:path';

import { atomicWrite } from '../assets.ts';
import { type Profile } from '../config.ts';
import { LearningClient } from '../learning-client.ts';
import { selectModel, type ModelId } from '../model-options.ts';
import { acquireLearningLock, learningLoop } from '../selfplay.ts';
import { learningAudit } from './audit.ts';
import { CounterpushBrowser } from './browser.ts';
import { learnCounterpushEpisode, playCounterpushEpisode } from './episode.ts';
import { CounterpushVisionClient } from './vision-client.ts';

export async function runCounterpush(options: {
  dataDir: string;
  profile: Profile;
  model: ModelId;
  hours: number;
  matches: number;
  signal: AbortSignal;
}) {
  const { dataDir, model, signal } = options;
  const control = join(dataDir, 'counterpush/control');
  await mkdir(control, { recursive: true, mode: 0o700 });
  const lock = await acquireLearningLock(join(dataDir, 'qwen/selfplay'));
  const state = {
    id: lock.owner.id,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    model: selectModel(model, true).name,
    phase: 'loading',
    completed: 0,
    updates: 0,
  };
  const report = async (status: Record<string, unknown>) => {
    Object.assign(state, status, { updatedAt: new Date().toISOString() });
    await atomicWrite(join(control, 'status.json'), JSON.stringify(state, null, 2) + '\n');
  };
  const client = new LearningClient(dataDir, model);
  const vision = new CounterpushVisionClient(dataDir);
  const resources = { browser: null as CounterpushBrowser | null };
  const abort = () => {
    client.close();
    vision.close();
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    await report({ phase: 'loading' });
    await client.ready();
    await vision.ready();
    const browser = await CounterpushBrowser.open(dataDir);
    resources.browser = browser;
    await report({ phase: 'ready', policy: await client.status() });
    const episodes = new Map<string, Awaited<ReturnType<typeof playCounterpushEpisode>>>();
    const result = await learningLoop({
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
      play: async () => {
        const disk = await statfs(dataDir);
        if (disk.bavail * disk.bsize < 8 * 1024 ** 3)
          throw new Error('남은 디스크가 8GB 미만이어서 다음 대전을 멈췄습니다.');
        const episode = await playCounterpushEpisode({
          ...options,
          browser,
          client,
          vision,
          report,
        });
        episodes.set(episode.directory, episode);
        return episode;
      },
      train: async (episode) => {
        await report({ phase: 'training', episode: episode.directory });
        const training = await learnCounterpushEpisode(client, dataDir, episodes.get(episode.directory)!);
        await appendFile(
          join(control, 'matches.jsonl'),
          JSON.stringify({
            ...episode,
            opponentActions: episodes.get(episode.directory)!.opponentActions,
            training,
            at: new Date().toISOString(),
          }) + '\n',
          { mode: 0o600 },
        );
        await report({
          phase: 'trained',
          policy: training.policy,
          training,
          lastResult: episode.result,
          lastEpisode: episode.directory,
          learningAudit: await learningAudit(dataDir, state.startedAt),
        });
        episodes.delete(episode.directory);
        return { updated: training.updated, version: Number(training.policy.version) };
      },
      returnToLobby: async () => {
        if ((await browser.phase()) !== 'result')
          throw new Error('다음 대전 전 결과 화면을 확인하지 못했습니다.');
      },
      report: async (status) => {
        await report(status);
      },
    });
    await report({ ...result, phase: 'stopped' });
    return result;
  } catch (error) {
    await resources.browser?.screenshot(join(control, 'last-error.png')).catch(() => {});
    await report({ phase: signal.aborted ? 'interrupted' : 'failed', error: String(error) });
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
    client.close();
    vision.close();
    await resources.browser?.close().catch(() => {});
    await lock.release();
  }
}
