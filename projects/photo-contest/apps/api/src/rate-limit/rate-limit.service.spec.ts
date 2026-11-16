import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ERROR_CODE } from '../common/errors';
import { WRITE_RATE_LIMIT } from '../config/limits';
import type { Database } from '../database/database.service';
import {
  rateLimitBucket,
  RateLimitService,
  uploadBudgetUnits,
  WRITE_RATE_LIMITED,
  type TWriteAction,
} from './rate-limit.service';

describe('uploadBudgetUnits', () => {
  it('업로드 크기를 올림한 KiB로 세고 아주 작은 파일도 1로 세야 한다', () => {
    expect([1, 1024, 1025, 10 * 1024 * 1024].map(uploadBudgetUnits)).toEqual([1, 1, 2, 10 * 1024]);
  });
});

describe('rateLimitBucket', () => {
  it('같은 창 안에서는 같은 키를, 창이 바뀌면 새 키와 다음 창 시작 만료를 써야 한다', () => {
    const windowMs = 60_000;
    const start = 1_800_000_000_000;
    const first = rateLimitBucket('UPLOAD_BYTES:address:203.0.113.1', windowMs, start);
    expect(rateLimitBucket('UPLOAD_BYTES:address:203.0.113.1', windowMs, start + windowMs - 1)).toEqual(
      first,
    );
    expect(first.expiresAt).toEqual(new Date(start + windowMs));
    expect(rateLimitBucket('UPLOAD_BYTES:address:203.0.113.1', windowMs, start + windowMs).keyHash).not.toBe(
      first.keyHash,
    );
    expect(rateLimitBucket('UPLOAD_BYTES:address:203.0.113.2', windowMs, start).keyHash).not.toBe(
      first.keyHash,
    );
    expect(first.keyHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('RateLimitService.consume', () => {
  beforeEach(() => {
    // 한도를 채우는 사이에 고정 창이 바뀌지 않게 시각을 멈춘다.
    vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ['Date'] });
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  /** 버킷마다 upsert로 더한 값을 돌려주는 DB 대역 */
  function createLimits() {
    const counts = new Map<string, number>();
    const upsert = vi.fn(async (args: { where: { keyHash: string }; create: { count: number } }) => {
      const count = (counts.get(args.where.keyHash) ?? 0) + args.create.count;
      counts.set(args.where.keyHash, count);
      return { count };
    });
    return { limits: new RateLimitService({ rateLimitBucket: { upsert } } as unknown as Database), upsert };
  }

  it.each(Object.keys(WRITE_RATE_LIMIT) as TWriteAction[])(
    '%s는 로그인한 사용자마다 perUser번까지만 허용해야 한다',
    async (action) => {
      const { limits, upsert } = createLimits();
      const actor = { userId: 'user-1', address: null };
      await Promise.all(
        Array.from({ length: WRITE_RATE_LIMIT[action].perUser }, () => limits.consume(action, actor)),
      );
      await expect(limits.consume(action, actor)).rejects.toMatchObject({
        message: WRITE_RATE_LIMITED,
        code: ERROR_CODE.RATE_LIMITED,
      });
      await expect(limits.consume(action, { userId: 'user-2', address: null })).resolves.toBeUndefined();
      expect(upsert).toHaveBeenCalledTimes(WRITE_RATE_LIMIT[action].perUser + 2);
    },
  );

  it('사용자가 없는 요청은 주소 버킷만 perAddress 한도로 세야 한다', async () => {
    const { limits, upsert } = createLimits();
    const actor = { userId: null, address: '203.0.113.7' };
    await Promise.all(
      Array.from({ length: WRITE_RATE_LIMIT.REPORT.perAddress }, () => limits.consume('REPORT', actor)),
    );
    await expect(limits.consume('REPORT', actor)).rejects.toMatchObject({ code: ERROR_CODE.RATE_LIMITED });
    expect(upsert).toHaveBeenCalledTimes(WRITE_RATE_LIMIT.REPORT.perAddress + 1);
  });
});
