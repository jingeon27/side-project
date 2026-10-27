export type RequestIdentity = {
  ip: string;
  /** A signed web-server call without a visitor address (cookie-free cached reads, sitemap). */
  internal?: boolean;
  userId?: string | null;
  path: string;
  method: string;
};
// Internal reads are shared by every visitor's cache misses, so they get a larger budget than one address.
export const INTERNAL_READ_LIMIT = 3000;
/** Supercell lookups per minute and identity, shared by preview, account saving and onboarding. */
export const GAME_PROFILE_LOOKUP_LIMIT = 10;
const authAttempts = new Set([
  '/api/admin/auth/login',
  '/api/auth/demo',
  '/api/auth/test-login',
  '/api/auth/test-token',
  '/api/auth/onboard',
  '/api/auth/google',
  '/api/auth/google/callback',
  '/api/auth/app/exchange',
]);
const healthPaths = new Set(['/api/health', '/api/health/live', '/api/health/ready']);

export function isHealthProbe(request: Pick<RequestIdentity, 'method' | 'path'>): boolean {
  return ['GET', 'HEAD'].includes(request.method) && healthPaths.has(request.path.replace(/\/+$/, ''));
}

function network(request: Pick<RequestIdentity, 'ip' | 'internal'>) {
  return request.internal ? 'internal' : `ip:${request.ip}`;
}

/** Applied before the session is loaded, so it is keyed only by the network identity. */
export function coarseRateBucket(request: Pick<RequestIdentity, 'ip' | 'internal'>) {
  return { key: `coarse:${network(request)}`, limit: request.internal ? INTERNAL_READ_LIMIT * 2 : 1000 };
}

export function requestRateBucket(request: RequestIdentity): { key: string; limit: number } {
  const path = request.path.replace(/\/+$/, '');
  if (authAttempts.has(path) || path.startsWith('/api/auth/social/'))
    return { key: `auth:${network(request)}`, limit: 30 };
  const action = ['GET', 'HEAD', 'OPTIONS'].includes(request.method) ? 'read' : 'write';
  const identity = request.userId ? `user:${request.userId}` : network(request);
  if (
    request.method === 'POST' &&
    (path === '/api/post-media/uploads' ||
      path === '/api/profile/avatar/uploads' ||
      /^\/api\/conversations\/[^/]+\/attachments\/uploads$/.test(path))
  )
    return { key: `upload:${identity}`, limit: 20 };
  // Each preview may call the Supercell API with the server token.
  if (request.method === 'GET' && /^\/api\/game-profiles\/[^/]+$/.test(path))
    return gameProfileBucket(identity);
  if (
    request.method === 'POST' &&
    (/^\/api\/profile\/avatar\/uploads\/[^/]+\/complete$/.test(path) ||
      /^\/api\/post-media\/[^/]+\/complete$/.test(path) ||
      /^\/api\/conversations\/[^/]+\/attachments\/[^/]+\/complete$/.test(path))
  )
    return { key: `upload-complete:${identity}`, limit: 20 };
  if (action === 'write') return { key: `write:${identity}`, limit: 60 };
  return { key: `read:${identity}`, limit: identity === 'internal' ? INTERNAL_READ_LIMIT : 240 };
}

function gameProfileBucket(identity: string) {
  return { key: `game-profile:${identity}`, limit: GAME_PROFILE_LOOKUP_LIMIT };
}
// Saving a game account and onboarding with a player tag also look the tag up upstream.
const upstreamLookupWrites = new Set(['/api/me/game-accounts', '/api/auth/onboard']);

/**
 * Every bucket one request consumes: its route bucket plus, for writes that may call the Supercell API, the
 * same `game-profile:` bucket as the preview so a client cannot bypass the lookup budget through them.
 */
export function requestRateBuckets(request: RequestIdentity): Array<{ key: string; limit: number }> {
  const primary = requestRateBucket(request);
  const path = request.path.replace(/\/+$/, '');
  if (request.method !== 'POST' || !upstreamLookupWrites.has(path)) return [primary];
  return [primary, gameProfileBucket(request.userId ? `user:${request.userId}` : network(request))];
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
