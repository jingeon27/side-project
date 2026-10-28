import { describe, expect, it } from 'vitest';

import { rateLimitBucket, uploadBudgetUnits } from './rate-limit.service';

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
