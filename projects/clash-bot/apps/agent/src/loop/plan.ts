import dayjs, { type Dayjs } from 'dayjs';

import type { ArenaChampion, ArenaRun } from '../arena/process.ts';
import type { LoopState, SelfImprovementSettings } from './state.ts';

type Arena = LoopState['arena'];
type Observation = { arena: Arena; event: { type: string; [key: string]: unknown } | null };

// 실패를 기록한다. 기간 안의 실패가 한도에 닿으면 막고, 사람이 원인을 보기 전까지 다시 시작하지 않는다.
export function withFailure(
  arena: Arena,
  now: Dayjs,
  settings: SelfImprovementSettings,
  error: string,
): Observation {
  const failures = [
    ...arena.failures.filter((at) => now.diff(dayjs(at), 'hour', true) < settings.arena.failureWindowHours),
    now.toISOString(),
  ];
  const blocked = failures.length >= settings.arena.maxFailures;
  return {
    arena: { ...arena, startedPid: null, failures, lastError: error, blocked },
    event: { type: blocked ? 'arena_blocked' : 'arena_failed', error, failures: failures.length },
  };
}

// 루프가 시작한 자가대국이 끝났는지 본다. 정상 정지는 사용자의 정지로 보고 일시정지하고,
// 실패나 상태를 남기기 전의 종료는 실패로 센다. 아직 살아 있으면 아무것도 바꾸지 않는다.
export function observeArena(
  arena: Arena,
  run: ArenaRun | null,
  startedAlive: boolean,
  now: Dayjs,
  settings: SelfImprovementSettings,
): Observation {
  if (arena.startedPid === null || startedAlive) return { arena, event: null };
  if (run?.pid !== arena.startedPid)
    return withFailure(
      arena,
      now,
      settings,
      '자가대국이 상태를 남기기 전에 끝났습니다. arena/control/console.log를 확인하세요.',
    );
  if (run.phase === 'stopped')
    return {
      arena: { ...arena, startedPid: null, paused: true },
      event: { type: 'arena_paused', pid: run.pid },
    };
  return withFailure(arena, now, settings, run.error ?? `자가대국이 ${run.phase} 단계에서 끝났습니다.`);
}

// 막혔거나 일시정지했거나 이미 돌고 있으면 시작하지 않는다. 실패 뒤에는 정해 둔 간격만큼 기다린다.
export function shouldStartArena(
  arena: Arena,
  run: ArenaRun | null,
  now: Dayjs,
  settings: SelfImprovementSettings,
) {
  if (arena.blocked || arena.paused || arena.startedPid !== null || run?.running) return false;
  const last = arena.failures.at(-1);
  if (!last) return true;
  const delays = settings.arena.restartDelaysSeconds;
  const delay = delays[Math.min(arena.failures.length, delays.length) - 1] ?? 0;
  return now.diff(dayjs(last), 'second') >= delay;
}

// 첫 버전(시작 가중치)은 실전에서 비교할 만큼 검증되지 않았다. 평가를 통과해 바뀐 챔피언만 넘긴다.
export const needsHandoff = (champion: ArenaChampion | null, handoff: LoopState['handoff']) =>
  champion !== null && champion.version > 0 && champion.weightsSHA256 !== handoff?.weightsSHA256;

export const due = (last: string | null, hours: number, now: Dayjs) =>
  last === null || now.diff(dayjs(last), 'hour', true) >= hours;
