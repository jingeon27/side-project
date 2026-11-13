import { describe, expect, it } from 'vitest';

import { isHealthProbe, requestRateBucket, RequestRateLimiter } from './rate-limit';

const request = { ip: '127.0.0.1', path: '/api/conversations', method: 'GET' };
describe('request rate limits across shared network addresses', () => {
  it('exempts only GET/HEAD requests to the exact health routes', () => {
    for (const path of ['/api/health', '/api/health/', '/api/health/live', '/api/health/ready/']) {
      expect(isHealthProbe({ method: 'GET', path })).toBe(true);
      expect(isHealthProbe({ method: 'HEAD', path })).toBe(true);
      expect(isHealthProbe({ method: 'POST', path })).toBe(false);
    }
    for (const path of ['/api/health/ready-extra', '/api/health/live/nested', '/api/session'])
      expect(isHealthProbe({ method: 'GET', path })).toBe(false);
  });
  it('keeps authenticated users on the same IP in separate read budgets', () => {
    const limiter = new RequestRateLimiter();
    const alice = requestRateBucket({ ...request, userId: 'alice' });
    const bob = requestRateBucket({ ...request, userId: 'bob' });
    for (let i = 0; i < 240; i++) expect(limiter.consume(alice.key, alice.limit, 0)).toBe(0);
    expect(limiter.consume(alice.key, alice.limit, 0)).toBe(60);
    expect(limiter.consume(bob.key, bob.limit, 0)).toBe(0);
    expect(limiter.consume(alice.key, alice.limit, 60000)).toBe(0);
  });
  it('bounds the window store by dropping expired and then the oldest windows instead of rescanning it', () => {
    const limiter = new RequestRateLimiter(60000, 3);
    expect(limiter.consume('old', 1, 0)).toBe(0);
    expect(limiter.consume('old', 1, 0)).toBe(60);
    for (const [index, key] of ['a', 'b', 'c'].entries()) expect(limiter.consume(key, 1, index + 1)).toBe(0);
    // 상한을 넘겨 가장 오래된 창이 빠졌으므로 같은 키는 새 창에서 다시 시작한다.
    expect(limiter.consume('old', 1, 10)).toBe(0);
    // 남은 창은 그대로 세어 우회되지 않는다.
    expect(limiter.consume('c', 1, 11)).toBe(60);
    // 창이 끝난 키는 다시 넣을 때 새 창으로 시작한다.
    expect(limiter.consume('c', 1, 60003)).toBe(0);
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
