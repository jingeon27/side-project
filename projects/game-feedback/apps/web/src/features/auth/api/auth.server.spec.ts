import { afterEach, describe, expect, it, vi } from 'vitest';

import { getServerSession } from './auth.server';

const { getSession, hasSessionCookie, serverRequestOptions } = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasSessionCookie: vi.fn(),
  serverRequestOptions: vi.fn(),
}));
vi.mock('next/cache', () => ({ cacheLife: vi.fn() }));
vi.mock('@game-feedback/sdk', () => ({ getSession }));
vi.mock('@/shared/api/server', () => ({
  hasSessionCookie,
  serverRequestOptions,
  publicServerOptions: () => ({ baseUrl: 'http://api.test', headers: { 'x-gf-client-ip': 'internal' } }),
}));
afterEach(() => vi.resetAllMocks());

describe('server-rendered session lookup', () => {
  it('uses the shared cookie-free lookup when the visitor has no session cookie', async () => {
    hasSessionCookie.mockResolvedValue(false);
    getSession.mockResolvedValue({ user: null });
    await getServerSession();
    expect(serverRequestOptions).not.toHaveBeenCalled();
    expect(getSession).toHaveBeenCalledExactlyOnceWith({
      baseUrl: 'http://api.test',
      headers: { 'x-gf-client-ip': 'internal' },
    });
  });
  it('sends the visitor cookie and address only when a session cookie exists', async () => {
    const options = { baseUrl: 'http://api.test', headers: { Cookie: 'gamefeedback_session=raw' } };
    hasSessionCookie.mockResolvedValue(true);
    serverRequestOptions.mockResolvedValue(options);
    getSession.mockResolvedValue({ user: { id: 'user-1' } });
    await getServerSession();
    expect(getSession).toHaveBeenCalledExactlyOnceWith(options);
  });
});
