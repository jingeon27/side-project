import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import {
  completionDeadline,
  MEDIA_COMPLETE_GRACE_SECONDS,
  MEDIA_UPLOAD_TTL_SECONDS,
  presignExpiry,
} from './media-storage.policy';

describe('direct upload completion window', () => {
  const reservedAt = dayjs('2026-10-27T00:00:00.000Z').toDate();

  it('keeps completion open for a grace period after the presigned form expires', () => {
    const formExpiresAt = presignExpiry(reservedAt);
    expect(dayjs(formExpiresAt).diff(reservedAt)).toBe(MEDIA_UPLOAD_TTL_SECONDS * 1000);
    expect(dayjs(completionDeadline(formExpiresAt)).diff(formExpiresAt)).toBe(
      MEDIA_COMPLETE_GRACE_SECONDS * 1000,
    );
  });

  it('allows a slow 25MB transfer that started just before the form expired', () => {
    // 25MB at 1 Mbit/s takes about 210 seconds after a start one second before expiry.
    const finishedAt = dayjs(presignExpiry(reservedAt))
      .subtract(1, 'second')
      .add(Math.ceil((25 * 8 * 1024 * 1024) / 1_000_000), 'second');
    expect(dayjs(completionDeadline(presignExpiry(reservedAt))).isAfter(finishedAt)).toBe(true);
    // The window still closes well before the daily prune removes unfinished reservations.
    expect(MEDIA_UPLOAD_TTL_SECONDS + MEDIA_COMPLETE_GRACE_SECONDS).toBeLessThan(86_400);
  });

  it.each(['2026-03-08T01:59:59.999-05:00', '2026-11-01T01:59:59.999-04:00'])(
    '시간대 경계 %s에서도 원본을 바꾸지 않고 밀리초 단위 TTL과 Date 계약을 유지해야 한다',
    (value) => {
      const start = dayjs(value).toDate();
      const original = dayjs(start).toISOString();
      const expiry = presignExpiry(start);
      const deadline = completionDeadline(expiry);
      expect(expiry).toBeInstanceOf(Date);
      expect(deadline).toBeInstanceOf(Date);
      expect(dayjs(expiry).diff(start)).toBe(MEDIA_UPLOAD_TTL_SECONDS * 1000);
      expect(dayjs(deadline).diff(expiry)).toBe(MEDIA_COMPLETE_GRACE_SECONDS * 1000);
      expect(dayjs(start).toISOString()).toBe(original);
    },
  );
});
