import { afterEach, expect, it, vi } from 'vitest';

import { Prisma } from '../../generated/prisma';
import { SERIALIZABLE_ATTEMPTS, TRANSACTION_RETRY_DELAY_MS } from '../config/limits';
import { Database } from './database.service';

vi.mock('../config/env', () => ({
  databaseUrl: () => 'postgresql://test:test@127.0.0.1:55442/photo_contest_test',
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('직렬화 충돌 직후 재시도 한도를 소진하지 않고 기다린 뒤 저장을 마친다', async () => {
  vi.useFakeTimers();
  const db = new Database();
  const conflict = new Prisma.PrismaClientKnownRequestError('Serialization failure', {
    code: 'P2034',
    clientVersion: 'test',
  });
  const transaction = vi.spyOn(db, '$transaction').mockRejectedValueOnce(conflict).mockResolvedValue('saved');
  const saved = db.atomic(async () => 'saved');

  await vi.advanceTimersByTimeAsync(TRANSACTION_RETRY_DELAY_MS - 1);
  expect(transaction).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  await expect(saved).resolves.toBe('saved');
  expect(transaction).toHaveBeenCalledTimes(2);
  await db.$disconnect();
});

it('계속 충돌해도 재시도 상한을 지키고 CONFLICT로 끝낸다', async () => {
  vi.useFakeTimers();
  const db = new Database();
  const conflict = new Prisma.PrismaClientKnownRequestError('Serialization failure', {
    code: 'P2034',
    clientVersion: 'test',
  });
  const transaction = vi.spyOn(db, '$transaction').mockRejectedValue(conflict);
  const result = expect(db.atomic(async () => 'saved')).rejects.toMatchObject({
    extensions: { code: 'CONFLICT' },
  });
  await vi.runAllTimersAsync();
  await result;
  expect(transaction).toHaveBeenCalledTimes(SERIALIZABLE_ATTEMPTS);
  await db.$disconnect();
});
