import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import dayjs from 'dayjs';

import { atomicWrite } from './assets.ts';

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
export async function acquireLearningLock(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'lock.json');
  const owner = { pid: process.pid, id: randomUUID() };
  const write = async () => {
    const file = await open(path, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(owner));
    } finally {
      await file.close();
    }
  };
  try {
    await write();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const old = JSON.parse(await readFile(path, 'utf8')) as { pid: number };
    if (!Number.isInteger(old.pid) || alive(old.pid))
      throw new Error('이미 자가학습 실행이 있습니다. selfplay status로 확인하세요.');
    await unlink(path);
    await write();
  }
  return {
    owner,
    release: async () => {
      const current = JSON.parse(await readFile(path, 'utf8')) as typeof owner;
      if (current.id === owner.id) await unlink(path);
    },
  };
}

export async function requestLearningStop(directory: string) {
  const owner = JSON.parse(await readFile(join(directory, 'lock.json'), 'utf8')) as {
    id: string;
    pid: number;
  };
  if (!alive(owner.pid)) throw new Error('현재 실행 중인 자가학습이 없습니다.');
  await atomicWrite(
    join(directory, 'stop.json'),
    JSON.stringify({ id: owner.id, requestedAt: dayjs().toISOString() }),
  );
}
