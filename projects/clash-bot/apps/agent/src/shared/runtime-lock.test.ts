import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { acquireLearningLock, readLockOwner, requestLearningStop } from './runtime-lock.ts';

// 실행 중일 수 없는 pid로 비정상 종료한 이전 소유자를 나타낸다.
const DEAD_PID = 2_147_483_646;
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function lockDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'clash-learning-lock-'));
  directories.push(directory);
  return directory;
}

// 파일 생성과 내용 기록 사이에 멈추면 빈 lock.json이 남아, 이후 시작·중지가 모두 JSON 오류로 실패했다.
it('reclaims a lock file left empty by a crash between creating and writing it', async () => {
  const directory = await lockDirectory();
  await writeFile(join(directory, 'lock.json'), '');
  await expect(requestLearningStop(directory)).rejects.toThrow('현재 실행 중인 자가학습이 없습니다.');
  const lock = await acquireLearningLock(directory);
  expect(await readLockOwner(directory)).toEqual(lock.owner);
  await lock.release();
  expect(await readLockOwner(directory)).toBeNull();
});

// 죽은 소유자를 동시에 확인한 두 실행이 각자 잠금을 지우고 다시 만들어 둘 다 잠금을 가질 수 있었다.
it('lets only one of two simultaneous takeovers of a dead owner lock succeed', async () => {
  const directory = await lockDirectory();
  await writeFile(join(directory, 'lock.json'), JSON.stringify({ pid: DEAD_PID, id: 'crashed' }));
  const results = await Promise.allSettled([acquireLearningLock(directory), acquireLearningLock(directory)]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toEqual([
    { status: 'rejected', reason: new Error('이미 자가학습 실행이 있습니다. selfplay status로 확인하세요.') },
  ]);
  expect(await readdir(directory)).toEqual(['lock.json']);
});
