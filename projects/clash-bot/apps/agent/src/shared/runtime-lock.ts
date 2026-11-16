import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import dayjs from 'dayjs';
import { z } from 'zod';

import { atomicWrite } from './assets.ts';
import { readOptionalJsonFile } from './json-file.ts';

const ownerSchema = z.object({ pid: z.int().positive(), id: z.string().min(1) });
const stopRequestSchema = z.strictObject({ id: z.string().min(1), requestedAt: z.iso.datetime() });
type LockOwner = z.infer<typeof ownerSchema>;

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// 비었거나 형식이 맞지 않는 잠금(이전 버전이 기록 도중 멈춘 파일)은 소유자가 없는 것으로 본다.
const parseOwner = (text: string): LockOwner | null => {
  try {
    const parsed = ownerSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export async function readLockOwner(directory: string): Promise<LockOwner | null> {
  try {
    return parseOwner(await readFile(join(directory, 'lock.json'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function acquireLearningLock(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'lock.json');
  const owner = { pid: process.pid, id: randomUUID() };
  const held = {
    owner,
    release: async () => {
      if ((await readLockOwner(directory))?.id === owner.id) await unlink(path);
    },
  };
  const running = () => new Error('이미 실행 중인 작업이 있습니다. status 명령으로 확인하세요.');
  // 내용을 모두 쓴 임시 파일을 link로 붙여 lock.json이 빈 채로 보이는 순간을 없앤다. 이미 있으면 false다.
  const create = async () => {
    const temporary = `${path}.${owner.id}.tmp`;
    await writeFile(temporary, JSON.stringify(owner), { mode: 0o600 });
    try {
      await link(temporary, path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw error;
    } finally {
      await unlink(temporary);
    }
  };
  if (await create()) return held;
  const current = await readLockOwner(directory);
  if (current && alive(current.pid)) throw running();
  // 죽은 소유자의 잠금은 rename으로 한 프로세스만 가져간다. 다른 프로세스가 먼저 가져갔으면 ENOENT다.
  const claimed = `${path}.${owner.id}.stale`;
  try {
    await rename(path, claimed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    if (await create()) return held;
    throw running();
  }
  const taken = parseOwner(await readFile(claimed, 'utf8'));
  if (taken && alive(taken.pid)) {
    // 확인과 rename 사이에 살아 있는 실행이 새 잠금을 만들었다. 그 잠금을 되돌리고 물러난다.
    try {
      await link(claimed, path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    await unlink(claimed);
    throw running();
  }
  await unlink(claimed);
  if (await create()) return held;
  throw running();
}

export async function requestLearningStop(directory: string) {
  const owner = await readLockOwner(directory);
  if (!owner || !alive(owner.pid)) throw new Error('현재 실행 중인 작업이 없습니다.');
  await atomicWrite(
    join(directory, 'stop.json'),
    JSON.stringify({ id: owner.id, requestedAt: dayjs().toISOString() }),
  );
}

// 중지 요청은 요청 당시의 실행에만 적용한다. 이전 실행이 남긴 요청은 새 실행을 멈추지 않는다.
export async function stopRequested(directory: string, ownerId: string): Promise<boolean> {
  const request = await readOptionalJsonFile(join(directory, 'stop.json'), stopRequestSchema);
  return request?.id === ownerId;
}
