import { setPriority } from 'node:os';

import type { Dayjs } from 'dayjs';
import { z } from 'zod';

import { readArenaChampion, readArenaRun, runArenaJson, startArenaInBackground } from '../arena/process.ts';
import { processAlive } from '../shared/runtime-lock.ts';
import { handOff } from './handoff.ts';
import { due, needsHandoff, observeArena, shouldStartArena, withFailure } from './plan.ts';
import { writeReport } from './report.ts';
import { recordEvent, SELF_IMPROVEMENT, type LoopState, type SelfImprovementSettings } from './state.ts';

// 프로세스를 띄우거나 네트워크를 쓰는 부분이다. 검사에서는 바꿔 끼운다.
export type LoopPorts = {
  startArena: (dataDir: string, args: string[]) => Promise<{ pid: number }>;
  checkRules: (dataDir: string) => Promise<unknown>;
  lowerPriority: (pid: number, niceness: number) => void;
};
const defaultPorts: LoopPorts = {
  startArena: startArenaInBackground,
  checkRules: (dataDir) => runArenaJson(dataDir, ['rules']),
  lowerPriority: (pid, niceness) => setPriority(pid, niceness),
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// 실전 경기의 화면 반응이 밀리지 않게 자가대국은 낮은 우선순위로 돌린다.
async function startArena(
  dataDir: string,
  arena: LoopState['arena'],
  now: Dayjs,
  settings: SelfImprovementSettings,
  ports: LoopPorts,
) {
  try {
    const started = await ports.startArena(dataDir, ['start', ...settings.arena.start]);
    ports.lowerPriority(started.pid, settings.arena.niceness);
    await recordEvent(dataDir, { at: now.toISOString(), type: 'arena_started', pid: started.pid });
    return { ...arena, startedPid: started.pid };
  } catch (error) {
    const failed = withFailure(arena, now, settings, `자가대국을 시작하지 못했습니다: ${message(error)}`);
    if (failed.event) await recordEvent(dataDir, { at: now.toISOString(), ...failed.event });
    return failed.arena;
  }
}

async function handOffIfNew(dataDir: string, state: LoopState, now: Dayjs) {
  const champion = await readArenaChampion(dataDir);
  if (!champion || !needsHandoff(champion, state.handoff)) return state.handoff;
  try {
    const handoff = await handOff(dataDir, champion, now);
    await recordEvent(dataDir, { type: 'champion_handed_over', ...handoff });
    return handoff;
  } catch (error) {
    await recordEvent(dataDir, { at: now.toISOString(), type: 'handoff_failed', error: message(error) });
    return state.handoff;
  }
}

const rulesSchema = z.looseObject({
  engineUpdateAvailable: z.boolean().optional(),
  upstreamVersion: z.string().optional(),
  errors: z.array(z.unknown()).default([]),
});

// 새 엔진·수치표는 자동으로 적용하지 않는다. 확인 결과만 남겨 사람이 검토하게 한다.
async function checkRules(dataDir: string, now: Dayjs, ports: LoopPorts) {
  try {
    const result = rulesSchema.parse(await ports.checkRules(dataDir));
    await recordEvent(dataDir, {
      at: now.toISOString(),
      type: 'rules_checked',
      engineUpdateAvailable: result.engineUpdateAvailable ?? null,
      upstreamVersion: result.upstreamVersion ?? null,
      errors: result.errors.length,
      needsReview: result.engineUpdateAvailable === true || result.errors.length > 0,
    });
  } catch (error) {
    await recordEvent(dataDir, { at: now.toISOString(), type: 'rules_check_failed', error: message(error) });
  }
  return now.toISOString();
}

async function reportIfDue(dataDir: string, state: LoopState, now: Dayjs, settings: SelfImprovementSettings) {
  if (!due(state.reportedAt, settings.reportHours, now)) return state.reportedAt;
  const path = await writeReport(dataDir, state, now);
  await recordEvent(dataDir, { at: now.toISOString(), type: 'report_written', path });
  return now.toISOString();
}

// 한 번의 점검이다. 자가대국 유지, 챔피언 인계, 패치 확인, 보고 순서로 하고 다음 상태를 돌려준다.
export async function tick(
  dataDir: string,
  state: LoopState,
  now: Dayjs,
  settings: SelfImprovementSettings = SELF_IMPROVEMENT,
  ports: LoopPorts = defaultPorts,
): Promise<LoopState> {
  const run = await readArenaRun(dataDir);
  const startedAlive = state.arena.startedPid !== null && processAlive(state.arena.startedPid);
  const observed = observeArena(state.arena, run, startedAlive, now, settings);
  if (observed.event) await recordEvent(dataDir, { at: now.toISOString(), ...observed.event });
  const arena = shouldStartArena(observed.arena, run, now, settings)
    ? await startArena(dataDir, observed.arena, now, settings, ports)
    : observed.arena;
  const handoff = await handOffIfNew(dataDir, state, now);
  const rulesCheckedAt = due(state.rulesCheckedAt, settings.rulesCheckHours, now)
    ? await checkRules(dataDir, now, ports)
    : state.rulesCheckedAt;
  const next = { ...state, arena, handoff, rulesCheckedAt };
  return { ...next, reportedAt: await reportIfDue(dataDir, next, now, settings) };
}
