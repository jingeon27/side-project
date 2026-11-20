import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import dayjs from 'dayjs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { simulationCandidateSchema } from '../trophy/protocol.ts';
import { eventsSince, SELF_IMPROVEMENT, startedState } from './state.ts';
import { tick, type LoopPorts } from './supervisor.ts';

// 실행 중이 아닌 것이 확실한 프로세스 번호다.
const DEAD_PID = 2_147_483_646;
const now = dayjs('2026-11-20T12:00:00.000Z');
const state = () => ({ ...startedState(null, now.toISOString()), rulesCheckedAt: now.toISOString() });
const dataDir = { path: '' };
beforeEach(async () => {
  dataDir.path = await mkdtemp(join(tmpdir(), 'clash-loop-'));
});
afterEach(async () => rm(dataDir.path, { recursive: true, force: true }));

const ports = (patch: Partial<LoopPorts> = {}): LoopPorts => ({
  startArena: vi.fn(async () => ({ pid: DEAD_PID })),
  checkRules: vi.fn(async () => ({ engineUpdateAvailable: false, errors: [] })),
  lowerPriority: vi.fn(),
  ...patch,
});

async function league(version: number, weightsSHA256: string) {
  const root = join(dataDir.path, 'arena/leagues/rules-test-fast4');
  await mkdir(root, { recursive: true });
  await mkdir(join(dataDir.path, 'arena/control'), { recursive: true });
  await writeFile(join(dataDir.path, 'arena/control/active.json'), JSON.stringify({ root }));
  await writeFile(
    join(root, 'champion-policy.json'),
    JSON.stringify({ version, weightsSHA256, weights: {} }),
  );
}

it('starts self-play with the contract arguments at a lower priority', async () => {
  const fake = ports();
  const next = await tick(dataDir.path, state(), now, SELF_IMPROVEMENT, fake);
  expect(fake.startArena).toHaveBeenCalledWith(dataDir.path, ['start', ...SELF_IMPROVEMENT.arena.start]);
  expect(fake.lowerPriority).toHaveBeenCalledWith(DEAD_PID, SELF_IMPROVEMENT.arena.niceness);
  expect(next.arena.startedPid).toBe(DEAD_PID);
  const after = await tick(dataDir.path, next, now.add(1, 'minute'), SELF_IMPROVEMENT, fake);
  expect(after.arena).toMatchObject({ startedPid: null, failures: [now.add(1, 'minute').toISOString()] });
  expect(
    (await eventsSince(dataDir.path, now.subtract(1, 'day').toISOString())).map((row) => row.type),
  ).toEqual(['arena_started', 'arena_failed']);
});

it('counts a self-play start that cannot spawn as a failure instead of stopping the loop', async () => {
  const fake = ports({ startArena: vi.fn(async () => Promise.reject(new Error('spawn python ENOENT'))) });
  const next = await tick(dataDir.path, state(), now, SELF_IMPROVEMENT, fake);
  expect(next.arena).toMatchObject({ startedPid: null, failures: [now.toISOString()] });
  expect(next.arena.lastError).toContain('ENOENT');
});

it('hands a newly qualified champion to Trophy once, as an immutable copy', async () => {
  await league(3, 'c'.repeat(64));
  const first = await tick(dataDir.path, state(), now, SELF_IMPROVEMENT, ports());
  const offer = simulationCandidateSchema.parse(
    JSON.parse(
      await readFile(join(dataDir.path, 'trophy/learning/control/simulation-candidate.json'), 'utf8'),
    ),
  );
  expect(offer).toMatchObject({ league: 'rules-test-fast4', version: 3, weightsSHA256: 'c'.repeat(64) });
  expect(JSON.parse(await readFile(offer.policy, 'utf8')).weightsSHA256).toBe('c'.repeat(64));
  expect(first.handoff).toMatchObject({ version: 3, at: now.toISOString() });
  const second = await tick(dataDir.path, first, now.add(1, 'minute'), SELF_IMPROVEMENT, ports());
  expect(second.handoff).toEqual(first.handoff);
});

it('checks balance patches daily and writes a report of the events since the last one', async () => {
  const fake = ports({ checkRules: vi.fn(async () => ({ engineUpdateAvailable: true, errors: [] })) });
  const stale = { ...state(), rulesCheckedAt: null, reportedAt: now.subtract(25, 'hour').toISOString() };
  const next = await tick(dataDir.path, stale, now, SELF_IMPROVEMENT, fake);
  expect(fake.checkRules).toHaveBeenCalledOnce();
  expect(next).toMatchObject({ rulesCheckedAt: now.toISOString(), reportedAt: now.toISOString() });
  const [name] = await readdir(join(dataDir.path, 'loop/reports'));
  const report = JSON.parse(await readFile(join(dataDir.path, 'loop/reports', String(name)), 'utf8'));
  expect(report.events.find((row: { type: string }) => row.type === 'rules_checked')).toMatchObject({
    engineUpdateAvailable: true,
    needsReview: true,
  });
  expect(report.notYetAutomated).toContain('perception_retraining');
  const quiet = await tick(dataDir.path, next, now.add(1, 'hour'), SELF_IMPROVEMENT, fake);
  expect(fake.checkRules).toHaveBeenCalledOnce();
  expect(quiet.reportedAt).toBe(now.toISOString());
});
