import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import dayjs from 'dayjs';
import { z } from 'zod';

import { SpawnPatterns } from '../../core/battle/spawn-patterns.ts';
import { FastPolicy } from '../../core/fast/policy.ts';
import type { Profile } from '../../core/profile.ts';
import { atomicWrite } from '../../shared/assets.ts';
import { readJsonFile } from '../../shared/json-file.ts';
import { acquireLearningLock, stopRequested } from '../../shared/runtime-lock.ts';
import { CounterpushBrowser } from '../browser/browser.ts';
import { fastController } from '../match/controllers.ts';
import { playCounterpushEpisode } from '../match/episode.ts';
import { CounterpushVisionClient } from '../perception/vision-client.ts';

// 자가대국 리그가 게시한 챔피언의 실시간 정책 파일이다(clash_bot.arena.league.publish_champion).
export async function championPolicyPath(dataDir: string) {
  const active = await readJsonFile(
    join(dataDir, 'arena/control/active.json'),
    z.looseObject({ root: z.string().min(1) }),
  );
  return join(active.root, 'champion-policy.json');
}

type Outcome = 'win' | 'loss' | 'draw' | 'unknown';

// 빠른 정책(controller 4)으로 실제 Counterpush 경기를 실시간으로 둔다. 학습하지 않고 경기 기록과 결과만 남긴다.
// 같은 전용 Chrome 프로필을 쓰므로 Qwen 반복 실행과 같은 실행 잠금을 잡는다.
export async function playFastMatches(options: {
  dataDir: string;
  profile: Profile;
  policyPath: string;
  matches: number;
  hours: number;
  signal: AbortSignal;
}) {
  const { dataDir, signal } = options;
  const control = join(dataDir, 'counterpush/control');
  await mkdir(control, { recursive: true, mode: 0o700 });
  const policy = await FastPolicy.load(options.policyPath);
  const lock = await acquireLearningLock(join(dataDir, 'qwen/selfplay'));
  const status = {
    id: lock.owner.id,
    pid: process.pid,
    startedAt: dayjs().toISOString(),
    phase: 'loading',
    controller: 4,
    policy: { path: options.policyPath, version: policy.version, weightsSHA256: policy.sha256 },
    completed: 0,
    results: { win: 0, loss: 0, draw: 0, unknown: 0 } satisfies Record<Outcome, number>,
  };
  const report = async (update: Record<string, unknown>) => {
    Object.assign(status, update, { updatedAt: dayjs().toISOString() });
    await atomicWrite(join(control, 'status.json'), JSON.stringify(status, null, 2) + '\n');
  };
  const vision = new CounterpushVisionClient(dataDir);
  const resources: { browser: CounterpushBrowser | null; patterns: SpawnPatterns | null } = {
    browser: null,
    patterns: null,
  };
  const deadline = options.hours ? dayjs().add(options.hours, 'hour') : null;
  const more = async () =>
    (options.matches === 0 || status.completed < options.matches) &&
    (!deadline || dayjs().isBefore(deadline)) &&
    !signal.aborted &&
    !(await stopRequested(join(dataDir, 'qwen/selfplay'), lock.owner.id));
  try {
    await report({ phase: 'loading' });
    await vision.ready();
    resources.browser = await CounterpushBrowser.open(dataDir);
    resources.patterns = await SpawnPatterns.open(join(dataDir, 'counterpush/patterns/graveyard.json'));
    while (await more()) {
      const episode = await playCounterpushEpisode({
        browser: resources.browser,
        controller: fastController(policy),
        vision,
        dataDir,
        profile: options.profile,
        signal,
        patterns: resources.patterns,
        persistPatterns: false,
        report: (update) => report({ ...update, phase: 'playing' }),
      });
      const outcome = z.enum(['win', 'loss', 'draw', 'unknown']).parse(episode.result);
      status.results[outcome]++;
      await appendFile(
        join(control, 'fast-play.jsonl'),
        JSON.stringify({
          at: dayjs().toISOString(),
          directory: episode.directory,
          result: outcome,
          blue: episode.blue,
          red: episode.red,
          actions: episode.actions,
          confirmed: episode.confirmed,
          learningEligible: episode.learningEligible,
          policyVersion: policy.version,
          weightsSHA256: policy.sha256,
        }) + '\n',
        { mode: 0o600 },
      );
      await report({ phase: 'played', completed: status.completed + 1, lastEpisode: episode.directory });
    }
    await report({ phase: 'stopped' });
    return status;
  } catch (error) {
    await resources.browser?.screenshot(join(control, 'last-error.png')).catch(() => {});
    await report({ phase: signal.aborted ? 'interrupted' : 'failed', error: String(error) });
    throw error;
  } finally {
    await vision.close();
    await resources.patterns?.save().catch(() => {});
    await resources.browser?.close().catch(() => {});
    await lock.release();
  }
}
