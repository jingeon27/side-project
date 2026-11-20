import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { z } from 'zod';

import { readOptionalJsonFile } from '../shared/json-file.ts';
import { pythonEnvironment, pythonExecutable } from '../shared/python.ts';
import { processAlive } from '../shared/runtime-lock.ts';

export const arenaControl = (dataDir: string) => join(dataDir, 'arena/control');

// Python 자가대국은 스레드 하나로 돈다. arena CLI와 자가개선 감독이 같은 실행 방식을 쓴다.
// 상태 확인과 정지 요청은 시뮬레이터가 설치되지 않은 컴퓨터에서도 시스템 Python으로 읽는다.
export function arenaProcess(dataDir: string, args: string[]) {
  const python = pythonExecutable(dataDir);
  const inspection = args[0] === 'status' || args[0] === 'stop';
  return {
    command: inspection && !process.env.CLASH_BOT_PYTHON && !existsSync(python) ? 'python3' : python,
    args: ['-u', '-m', 'clash_bot.arena.cli', ...args],
    env: {
      ...pythonEnvironment(dataDir),
      OPENBLAS_NUM_THREADS: '1',
      VECLIB_MAXIMUM_THREADS: '1',
      OMP_NUM_THREADS: '1',
    },
  };
}

// 터미널과 분리해 실행하고 출력은 control/console.log에 덧붙인다. 실행 파일을 찾지 못하면 오류를 낸다.
export async function startArenaInBackground(dataDir: string, args: string[]) {
  const directory = arenaControl(dataDir);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const log = join(directory, 'console.log');
  const output = openSync(log, 'a', 0o600);
  try {
    const run = arenaProcess(dataDir, args);
    const child = spawn(run.command, run.args, {
      env: run.env,
      detached: true,
      stdio: ['ignore', output, output],
    });
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    child.unref();
    if (!child.pid) throw new Error('자가대국 프로세스 번호를 받지 못했습니다.');
    return { pid: child.pid, log };
  } finally {
    closeSync(output);
  }
}

// 끝까지 기다린 뒤 마지막 JSON 출력을 돌려준다. 실패하면 표준 오류의 마지막 부분을 오류로 낸다.
export async function runArenaJson(dataDir: string, args: string[]): Promise<unknown> {
  const run = arenaProcess(dataDir, args);
  const child = spawn(run.command, run.args, { env: run.env, stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  // Python 예외는 마지막 줄들에 원인이 있다. 글자 수로 자르면 줄 중간부터 남으므로 줄 단위로 자른다.
  const tail = Buffer.concat(stderr).toString().trim().split('\n').slice(-5).join('\n');
  if (code !== 0) throw new Error(tail || `exit ${code}`);
  return JSON.parse(Buffer.concat(stdout).toString());
}

// Python Control이 쓰는 상태 파일이다. 시작 시각은 초 단위 숫자라 실행 여부에 필요한 필드만 읽는다.
const runSchema = z.looseObject({
  id: z.string(),
  pid: z.int().positive(),
  phase: z.string(),
  error: z.string().optional(),
  completedGames: z.int().nonnegative().optional(),
  completedGenerations: z.int().nonnegative().optional(),
});
export type ArenaRun = z.infer<typeof runSchema> & { running: boolean };

export async function readArenaRun(dataDir: string): Promise<ArenaRun | null> {
  const status = await readOptionalJsonFile(join(arenaControl(dataDir), 'status.json'), runSchema);
  if (!status) return null;
  return { ...status, running: processAlive(status.pid) && !['stopped', 'failed'].includes(status.phase) };
}

const championSchema = z.looseObject({
  version: z.int().nonnegative(),
  weightsSHA256: z.string().length(64),
});
export type ArenaChampion = { league: string; version: number; weightsSHA256: string; policy: string };

// 지금 리그의 실전용 챔피언 정책이다. 챔피언이 바뀔 때마다 Python 리그가 다시 쓴다.
export async function readArenaChampion(dataDir: string): Promise<ArenaChampion | null> {
  const active = await readOptionalJsonFile(
    join(arenaControl(dataDir), 'active.json'),
    z.looseObject({ root: z.string().min(1) }),
  );
  if (!active) return null;
  const policy = join(active.root, 'champion-policy.json');
  const champion = await readOptionalJsonFile(policy, championSchema);
  if (!champion) return null;
  return {
    league: basename(active.root),
    version: champion.version,
    weightsSHA256: champion.weightsSHA256,
    policy,
  };
}
