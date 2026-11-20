import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import type { ArenaChampion, ArenaRun } from '../arena/process.ts';
import { due, needsHandoff, observeArena, shouldStartArena } from './plan.ts';
import { SELF_IMPROVEMENT, startedState, type LoopState } from './state.ts';

const now = dayjs('2026-11-20T12:00:00.000Z');
const settings = {
  ...SELF_IMPROVEMENT,
  arena: {
    ...SELF_IMPROVEMENT.arena,
    restartDelaysSeconds: [60, 300],
    failureWindowHours: 6,
    maxFailures: 3,
  },
};
const arena = (patch: Partial<LoopState['arena']> = {}) => ({
  ...startedState(null, now.toISOString()).arena,
  ...patch,
});
const run = (patch: Partial<ArenaRun>): ArenaRun => ({
  id: 'run',
  pid: 4242,
  phase: 'selfplay',
  running: false,
  ...patch,
});

describe('자가대국 감시', () => {
  it('살아 있거나 루프가 시작하지 않은 실행은 그대로 둔다', () => {
    expect(observeArena(arena(), null, false, now, settings).event).toBeNull();
    expect(observeArena(arena({ startedPid: 4242 }), run({}), true, now, settings).event).toBeNull();
  });

  it('정상 정지는 사용자의 정지로 보고 다시 시작하지 않는다', () => {
    const observed = observeArena(
      arena({ startedPid: 4242 }),
      run({ phase: 'stopped' }),
      false,
      now,
      settings,
    );
    expect(observed).toMatchObject({
      arena: { startedPid: null, paused: true },
      event: { type: 'arena_paused' },
    });
    expect(shouldStartArena(observed.arena, null, now.add(1, 'day'), settings)).toBe(false);
  });

  it('실패와 상태를 남기기 전의 종료를 세고, 기간 안에 한도에 닿으면 막는다', () => {
    const failed = observeArena(
      arena({ startedPid: 4242 }),
      run({ phase: 'failed', error: 'boom' }),
      false,
      now,
      settings,
    );
    expect(failed).toMatchObject({
      arena: { failures: [now.toISOString()], lastError: 'boom', blocked: false },
    });
    const silent = observeArena(arena({ startedPid: 7 }), run({ pid: 4242 }), false, now, settings);
    expect(silent.event).toMatchObject({ type: 'arena_failed' });
    const old = now.subtract(7, 'hour').toISOString();
    const recent = now.subtract(1, 'hour').toISOString();
    const blocked = observeArena(
      arena({ startedPid: 4242, failures: [old, recent, recent] }),
      run({ phase: 'failed' }),
      false,
      now,
      settings,
    );
    expect(blocked).toMatchObject({
      arena: { blocked: true },
      event: { type: 'arena_blocked', failures: 3 },
    });
  });
});

describe('자가대국 시작', () => {
  it('막힘·일시정지·실행 중이면 시작하지 않는다', () => {
    expect(shouldStartArena(arena(), null, now, settings)).toBe(true);
    expect(shouldStartArena(arena({ blocked: true }), null, now, settings)).toBe(false);
    expect(shouldStartArena(arena({ paused: true }), null, now, settings)).toBe(false);
    expect(shouldStartArena(arena({ startedPid: 4242 }), null, now, settings)).toBe(false);
    expect(shouldStartArena(arena(), run({ running: true }), now, settings)).toBe(false);
  });

  it('실패 횟수에 맞는 간격을 기다린 뒤 다시 시작한다', () => {
    const one = arena({ failures: [now.toISOString()] });
    expect(shouldStartArena(one, null, now.add(59, 'second'), settings)).toBe(false);
    expect(shouldStartArena(one, null, now.add(60, 'second'), settings)).toBe(true);
    const two = arena({ failures: [now.toISOString(), now.toISOString()] });
    expect(shouldStartArena(two, null, now.add(299, 'second'), settings)).toBe(false);
    expect(shouldStartArena(two, null, now.add(300, 'second'), settings)).toBe(true);
  });
});

describe('챔피언 인계와 정기 작업', () => {
  const champion = (version: number, weightsSHA256 = 'a'.repeat(64)): ArenaChampion => ({
    league: 'rules-fast4',
    version,
    weightsSHA256,
    policy: '/league/champion-policy.json',
  });

  it('평가를 통과해 바뀐 챔피언만 넘긴다', () => {
    expect(needsHandoff(null, null)).toBe(false);
    expect(needsHandoff(champion(0), null)).toBe(false);
    expect(needsHandoff(champion(3), null)).toBe(true);
    const handed = {
      league: 'rules-fast4',
      version: 3,
      weightsSHA256: 'a'.repeat(64),
      at: now.toISOString(),
    };
    expect(needsHandoff(champion(3), handed)).toBe(false);
    expect(needsHandoff(champion(4, 'b'.repeat(64)), handed)).toBe(true);
  });

  it('마지막 실행에서 정한 시간이 지나면 다시 한다', () => {
    expect(due(null, 24, now)).toBe(true);
    expect(due(now.subtract(23, 'hour').toISOString(), 24, now)).toBe(false);
    expect(due(now.subtract(24, 'hour').toISOString(), 24, now)).toBe(true);
  });
});
