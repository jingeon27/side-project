import { describe, expect, it } from 'vitest';
import { RequestRateLimiter, requestRateBucket } from './rate-limit';

const request = { ip: '127.0.0.1', path: '/api/conversations', method: 'GET' };
describe('request rate limits across shared network addresses', () => {
  it('keeps authenticated users on the same IP in separate read budgets', () => {
    const limiter = new RequestRateLimiter();
    const alice = requestRateBucket({ ...request, userId: 'alice' });
    const bob = requestRateBucket({ ...request, userId: 'bob' });
    for (let i = 0; i < 240; i++) expect(limiter.consume(alice.key, alice.limit, 0)).toBe(0);
    expect(limiter.consume(alice.key, alice.limit, 0)).toBe(60);
    expect(limiter.consume(bob.key, bob.limit, 0)).toBe(0);
    expect(limiter.consume(alice.key, alice.limit, 60000)).toBe(0);
  });
  it('shares a user write budget across sessions and IP changes', () => {
    const limiter = new RequestRateLimiter();
    const first = requestRateBucket({ ...request, userId: 'alice', method: 'POST' });
    const otherAddress = requestRateBucket({ ...request, ip: '127.0.0.2', userId: 'alice', method: 'POST' });
    expect(first.key).toBe(otherAddress.key);
    for (let i = 0; i < 60; i++) expect(limiter.consume(first.key, first.limit, 0)).toBe(0);
    expect(limiter.consume(otherAddress.key, otherAddress.limit, 1000)).toBe(59);
  });
  it('keeps anonymous and authentication attempts scoped to IP', () => {
    const anonymous = requestRateBucket(request);
    expect(anonymous.key).toBe('read:ip:127.0.0.1');
    for (const path of [
      '/api/auth/demo',
      '/api/auth/test-login/',
      '/api/auth/google',
      '/api/auth/app/exchange',
    ]) {
      const first = requestRateBucket({ ...request, path, userId: 'alice' });
      const second = requestRateBucket({ ...request, path, userId: 'bob' });
      expect(first).toEqual({ key: 'auth:ip:127.0.0.1', limit: 30 });
      expect(second.key).toBe(first.key);
    }
  });
  it('treats the test catalog as a read and logout as a write', () => {
    expect(requestRateBucket({ ...request, path: '/api/auth/test-accounts', userId: 'alice' })).toEqual({
      key: 'read:user:alice',
      limit: 240,
    });
    expect(
      requestRateBucket({ ...request, path: '/api/auth/logout', method: 'POST', userId: 'alice' }),
    ).toEqual({ key: 'write:user:alice', limit: 60 });
  });
});
