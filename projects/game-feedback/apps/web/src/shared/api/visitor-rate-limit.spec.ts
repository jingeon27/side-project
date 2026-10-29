import { describe, expect, it } from 'vitest';

import { VisitorRateLimiter } from './visitor-rate-limit';

describe('VisitorRateLimiter', () => {
  it('counts each visitor in its own window and reports when to retry', () => {
    const limiter = new VisitorRateLimiter(2, 60_000);
    expect([limiter.consume('203.0.113.7', 0), limiter.consume('203.0.113.7', 1_000)]).toEqual([0, 0]);
    expect(limiter.consume('203.0.113.7', 10_000)).toBe(50);
    expect(limiter.consume('198.51.100.9', 10_000)).toBe(0);
    expect(limiter.consume('203.0.113.7', 60_000)).toBe(0);
  });

  it('forgets the least recently seen visitors beyond its size bound', () => {
    const limiter = new VisitorRateLimiter(1, 60_000, 2);
    limiter.consume('a', 0);
    limiter.consume('b', 0);
    limiter.consume('a', 0);
    limiter.consume('c', 0);
    // a was seen again, so it stayed and is still over its budget; b was evicted and starts a new window.
    expect(limiter.consume('a', 1)).toBeGreaterThan(0);
    expect(limiter.consume('b', 1)).toBe(0);
  });
});
