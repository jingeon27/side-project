import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import dayjs from 'dayjs';

import { arenaControl } from '../arena/process.ts';
import { atomicWrite } from '../shared/assets.ts';
import {
  acquireLearningLock,
  processAlive,
  readLockOwner,
  requestLearningStop,
  stopRequested,
} from '../shared/runtime-lock.ts';
import {
  loopControl,
  readLoopState,
  recordEvent,
  saveLoopState,
  SELF_IMPROVEMENT,
  startedState,
  type LoopState,
} from './state.ts';
import { tick } from './supervisor.ts';

// 루프가 시작한 자가대국만 멈춘다. 사용자가 따로 띄운 자가대국은 건드리지 않는다.
async function stopOwnArena(dataDir: string, state: LoopState | null) {
  const pid = state?.arena.startedPid;
  if (!pid || !processAlive(pid)) return;
  if ((await readLockOwner(arenaControl(dataDir)))?.pid !== pid) return;
  await requestLearningStop(arenaControl(dataDir));
}

// 맥이 잠들면 자가대국과 실전이 함께 멈춘다. 요청하면 이 프로세스가 끝날 때까지 시스템 잠자기를 막는다.
function keepAwake() {
  if (process.platform !== 'darwin') return;
  spawn('caffeinate', ['-i', '-w', String(process.pid)], { detached: true, stdio: 'ignore' }).unref();
}

// 정지 요청이나 신호가 올 때까지 정해 둔 간격으로 점검한다. 매 점검 뒤 상태를 저장하므로 다시 시작하면 이어서 돈다.
export async function superviseUntilStopped(dataDir: string, options: { keepAwake: boolean }) {
  const control = loopControl(dataDir);
  const lock = await acquireLearningLock(control);
  const abort = new AbortController();
  const interrupt = () => abort.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const startedAt = dayjs().toISOString();
  const writeStatus = (phase: string, extra: Record<string, unknown> = {}) =>
    atomicWrite(
      join(control, 'status.json'),
      JSON.stringify(
        { ...lock.owner, phase, startedAt, updatedAt: dayjs().toISOString(), ...extra },
        null,
        2,
      ) + '\n',
    );
  try {
    if (options.keepAwake) keepAwake();
    await saveLoopState(dataDir, startedState(await readLoopState(dataDir), startedAt));
    await recordEvent(dataDir, {
      at: startedAt,
      type: 'loop_started',
      pid: process.pid,
      keepAwake: options.keepAwake,
    });
    while (!abort.signal.aborted && !(await stopRequested(control, lock.owner.id))) {
      const state = await readLoopState(dataDir);
      if (!state) throw new Error('자가개선 상태 파일이 없습니다.');
      const next = await tick(dataDir, state, dayjs());
      await saveLoopState(dataDir, next);
      await writeStatus('running', { state: next });
      await sleep(SELF_IMPROVEMENT.tickSeconds * 1000, undefined, { signal: abort.signal }).catch(
        (error: unknown) => {
          if (!(error instanceof Error && error.name === 'AbortError')) throw error;
        },
      );
    }
    await stopOwnArena(dataDir, await readLoopState(dataDir));
    await recordEvent(dataDir, { at: dayjs().toISOString(), type: 'loop_stopped' });
    await writeStatus('stopped');
  } catch (error) {
    await writeStatus('failed', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
    await lock.release();
  }
}
