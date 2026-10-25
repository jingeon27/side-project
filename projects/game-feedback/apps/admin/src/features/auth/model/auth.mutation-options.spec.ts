import { MutationObserver, QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SessionSchema } from '@game-feedback/contracts';

import { loginMutationOptions, logoutMutationOptions } from './auth.mutation-options';
import { sessionOptions } from './auth.options';

const auth = vi.hoisted(() => ({ login: vi.fn(), logout: vi.fn(), session: vi.fn() }));
vi.mock('../api/auth.api', () => ({
  loginAdmin: auth.login,
  endSession: auth.logout,
  fetchSession: auth.session,
}));

afterEach(() => vi.resetAllMocks());

describe('admin session transitions', () => {
  it('cancels the previous account request and purges its cache before installing the admin session', async () => {
    const client = new QueryClient();
    client.setQueryData(
      sessionOptions().queryKey,
      SessionSchema.parse({
        user: null,
        demoMode: true,
        googleConfigured: false,
        needsOnboarding: false,
      }),
    );
    const sessionObserver = new QueryObserver(client, { ...sessionOptions(), enabled: false });
    const unsubscribe = sessionObserver.subscribe(() => undefined);
    const cancelled = vi.fn();
    client.setQueryData(['previous-private-data'], { secret: 'previous account' });
    const previousRequest = client
      .fetchQuery({
        queryKey: ['previous-private-request'],
        queryFn: ({ signal }) => {
          signal.addEventListener('abort', cancelled);
          return new Promise<never>(() => undefined);
        },
      })
      .catch(() => undefined);
    const session = SessionSchema.parse({
      user: {
        id: 'administrator',
        nickname: '운영자',
        role: 'ADMIN',
        isVerified: false,
        supercellTag: null,
        isTestAccount: true,
        createdAt: '2026-10-20T00:00:00.000Z',
        verifiedAt: null,
      },
      demoMode: true,
      googleConfigured: false,
      needsOnboarding: false,
    });
    auth.login.mockResolvedValue(session);

    await new MutationObserver(client, loginMutationOptions(client)).mutate({
      username: 'admin',
      password: 'test-password',
    });
    await previousRequest;

    expect(cancelled).toHaveBeenCalledOnce();
    expect(client.getQueryData(['previous-private-data'])).toBeUndefined();
    expect(client.getQueryData(['previous-private-request'])).toBeUndefined();
    expect(client.getQueryData(sessionOptions().queryKey)).toEqual(session);
    expect(sessionObserver.getCurrentResult().data).toEqual(session);
    expect(client.getQueryCache().getAll()).toHaveLength(1);
    unsubscribe();
    client.clear();
  });

  it('removes private admin data on logout and caches only the anonymous session', async () => {
    const client = new QueryClient();
    client.setQueryData(['private-admin-record'], { nickname: 'private user' });
    const session = SessionSchema.parse({
      user: null,
      demoMode: true,
      googleConfigured: false,
      needsOnboarding: false,
    });
    auth.logout.mockResolvedValue(session);

    await new MutationObserver(client, logoutMutationOptions(client)).mutate();

    expect(client.getQueryData(['private-admin-record'])).toBeUndefined();
    expect(client.getQueryData(sessionOptions().queryKey)).toEqual(session);
    expect(client.getQueryCache().getAll()).toHaveLength(1);
    client.clear();
  });

  it('preserves the current session and cache when login fails', async () => {
    const client = new QueryClient();
    const session = SessionSchema.parse({
      user: null,
      demoMode: true,
      googleConfigured: false,
      needsOnboarding: false,
    });
    client.setQueryData(sessionOptions().queryKey, session);
    client.setQueryData(['existing-data'], 'keep');
    auth.login.mockRejectedValue(new Error('Session request failed'));

    await expect(
      new MutationObserver(client, loginMutationOptions(client)).mutate({
        username: 'admin',
        password: 'test-password',
      }),
    ).rejects.toThrow('Session request failed');

    expect(client.getQueryData(sessionOptions().queryKey)).toEqual(session);
    expect(client.getQueryData(['existing-data'])).toBe('keep');
    client.clear();
  });
});
