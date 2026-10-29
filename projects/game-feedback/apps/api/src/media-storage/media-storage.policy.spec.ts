import { describe, expect, it } from 'vitest';

import {
  completionDeadline,
  MEDIA_COMPLETE_GRACE_SECONDS,
  MEDIA_UPLOAD_TTL_SECONDS,
  presignExpiry,
} from './media-storage.policy';

describe('direct upload completion window', () => {
  const reservedAt = new Date('2026-10-27T00:00:00.000Z');

  it('keeps completion open for a grace period after the presigned form expires', () => {
    const formExpiresAt = presignExpiry(reservedAt);
    expect(formExpiresAt.getTime() - reservedAt.getTime()).toBe(MEDIA_UPLOAD_TTL_SECONDS * 1000);
    expect(completionDeadline(formExpiresAt).getTime() - formExpiresAt.getTime()).toBe(
      MEDIA_COMPLETE_GRACE_SECONDS * 1000,
    );
  });

  it('allows a slow 25MB transfer that started just before the form expired', () => {
    // 25MB at 1 Mbit/s takes about 210 seconds after a start one second before expiry.
    const finishedAt =
      presignExpiry(reservedAt).getTime() - 1000 + Math.ceil((25 * 8 * 1024 * 1024) / 1_000_000) * 1000;
    expect(completionDeadline(presignExpiry(reservedAt)).getTime()).toBeGreaterThan(finishedAt);
    // The window still closes well before the daily prune removes unfinished reservations.
    expect(MEDIA_UPLOAD_TTL_SECONDS + MEDIA_COMPLETE_GRACE_SECONDS).toBeLessThan(86_400);
  });
});
