import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { SessionService } from '../../auth/session.service';
import type { SessionRequest } from '../../auth/session.types';
import type { AppConfig } from '../../config/app.config';
import { ApiAccessMiddleware } from './api-access.middleware';

const webOrigin = 'http://localhost:3300';

function middleware() {
  const loadSession = vi.fn(async (_req: SessionRequest) => undefined);
  const sessions = { loadSession } satisfies Pick<SessionService, 'loadSession'>;
  const config = { webOrigin, rateLimit: true } satisfies Pick<AppConfig, 'webOrigin' | 'rateLimit'>;
  return {
    access: new ApiAccessMiddleware(sessions as unknown as SessionService, config as unknown as AppConfig),
    loadSession,
  };
}
function call(
  access: ApiAccessMiddleware,
  path: string,
  method = 'GET',
  headers: Record<string, string> = {},
) {
  const req = { path, method, headers, ip: '203.0.113.7' } as unknown as SessionRequest;
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  const next = vi.fn();
  return { done: access.use(req, res as unknown as Response, next), res, next };
}

describe('API access checks for paths that differ only by letter case', () => {
  it.each(['/API/posts', '/Api/Posts', '/api/Auth/demo'])(
    'rejects a cross-origin write to %s before it can reach routing',
    async (path) => {
      const { access, loadSession } = middleware();
      const { done, res, next } = call(access, path, 'POST', { origin: 'https://outside.test' });
      await done;
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'INVALID_ORIGIN' }));
      expect(loadSession).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    },
  );
  it('loads the session and applies the read budget to case variants', async () => {
    const { access, loadSession } = middleware();
    for (const _ of Array.from({ length: 240 })) await call(access, '/API/posts').done;
    expect(loadSession).toHaveBeenCalledTimes(240);
    const { done, res } = call(access, '/api/posts');
    await done;
    expect(res.status).toHaveBeenCalledWith(429);
  });
  it('leaves non-API paths to other handlers', async () => {
    const { access, loadSession } = middleware();
    const { done, next } = call(access, '/_internal/visibility/excluded-authors');
    await done;
    expect(next).toHaveBeenCalledWith();
    expect(loadSession).not.toHaveBeenCalled();
  });
});
