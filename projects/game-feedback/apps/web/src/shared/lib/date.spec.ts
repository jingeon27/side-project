import { afterEach, describe, expect, it, vi } from 'vitest';
import { dateKey, formatDate, formatTime, isAtOrBefore, timeAgo } from './date';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
describe('service dates', () => {
  it('groups chat messages by Seoul midnight independently of the host time zone', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
    expect(dateKey('2026-10-16T14:59:59.000Z')).toBe('2026-10-16');
    expect(dateKey('2026-10-16T15:00:00.000Z')).toBe('2026-10-17');
    expect(formatDate('2026-10-16T15:00:00.000Z', 'en')).toBe('10/17/2026');
    expect(formatDate('2026-10-16T15:00:00.000Z', 'ja')).toBe('2026/10/17');
    expect(formatTime('2026-10-16T15:00:00.000Z', 'en')).toBe('12:00 AM');
  });
  it('keeps relative thresholds and translations and clamps future timestamps', () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-10-17T12:00:00.000Z');
    expect(timeAgo('2026-10-17T12:01:00.000Z', 'ko')).toBe('방금 전');
    expect(timeAgo('2026-10-17T11:59:00.000Z', 'en')).toBe('1 min ago');
    expect(timeAgo('2026-10-17T11:00:00.000Z', 'ja')).toBe('1時間前');
    expect(timeAgo('2026-10-16T12:00:00.000Z', 'ko')).toBe('1일 전');
    expect(timeAgo('2026-09-01T00:00:00.000Z', 'en')).toBe('9/1/2026');
  });
  it('marks only messages at or before the peer read boundary as read', () => {
    const boundary = '2026-10-17T00:00:00.000Z';
    expect(isAtOrBefore(boundary, boundary)).toBe(true);
    expect(isAtOrBefore('2026-10-17T00:00:01.000Z', boundary)).toBe(false);
    expect(isAtOrBefore(boundary, null)).toBe(false);
  });
});
