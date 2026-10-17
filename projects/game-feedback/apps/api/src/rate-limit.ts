export type RequestIdentity = { ip: string; userId?: string | null; path: string; method: string };
const authAttempts = new Set([
  '/api/auth/demo',
  '/api/auth/test-login',
  '/api/auth/onboard',
  '/api/auth/google',
  '/api/auth/google/callback',
  '/api/auth/app/exchange',
]);

export function requestRateBucket(request: RequestIdentity): { key: string; limit: number } {
  const path = request.path.replace(/\/+$/, '');
  if (authAttempts.has(path)) return { key: `auth:ip:${request.ip}`, limit: 30 };
  const action = ['GET', 'HEAD', 'OPTIONS'].includes(request.method) ? 'read' : 'write';
  const identity = request.userId ? `user:${request.userId}` : `ip:${request.ip}`;
  if (
    request.method === 'POST' &&
    (path === '/api/post-media' || /^\/api\/conversations\/[^/]+\/attachments$/.test(path))
  )
    return { key: `upload:${identity}`, limit: 20 };
  return { key: `${action}:${identity}`, limit: action === 'read' ? 240 : 60 };
}

export class RequestRateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();
  constructor(private readonly windowMs = 60000) {}

  /** Returns zero when allowed, otherwise the Retry-After value in seconds. */
  consume(key: string, limit: number, now = Date.now()): number {
    let window = this.windows.get(key);
    if (!window || now - window.start >= this.windowMs) {
      window = { start: now, count: 0 };
      this.windows.set(key, window);
    }
    if (this.windows.size > 10000) {
      for (const [candidate, value] of this.windows)
        if (now - value.start >= this.windowMs) this.windows.delete(candidate);
    }
    window.count += 1;
    return window.count > limit ? Math.max(1, Math.ceil((this.windowMs - (now - window.start)) / 1000)) : 0;
  }
}
