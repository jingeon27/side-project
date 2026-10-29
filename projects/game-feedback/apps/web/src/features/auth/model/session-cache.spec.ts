import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Session } from '@/shared/api';

import { sessionOptions } from './auth.options';
import { clearAuthenticatedSession, refreshSession, replaceSession } from './session-cache';

const { loadSession } = vi.hoisted(() => ({ loadSession: vi.fn() }));
vi.mock('../api/auth.api', () => ({ fetchSession: loadSession, fetchTestAccounts: vi.fn() }));
afterEach(() => loadSession.mockReset());

const signedInSession: Session = {
  user: {
    id: 'alice',
    nickname: '플레이어',
    isVerified: false,
    supercellTag: null,
    isTestAccount: true,
    role: 'USER',
    createdAt: '2026-10-17T00:00:00.000Z',
    verifiedAt: null,
  },
  demoMode: true,
  googleConfigured: true,
  needsOnboarding: false,
};

describe('session identity cache boundary', () => {
  it('cancels an old identity request and removes private queries before switching', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(sessionOptions().queryKey, signedInSession);
    client.setQueryData(['private-history', 'alice'], { body: '비공개 메시지' });
    let cancelled = false;
    const pending = client
      .fetchQuery({
        queryKey: ['private-pending', 'alice'],
        queryFn: ({ signal }) =>
          new Promise<string>((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              cancelled = true;
              reject(new Error('cancelled'));
            });
          }),
      })
      .catch(() => undefined);
    const next: Session = {
      ...signedInSession,
      user: signedInSession.user ? { ...signedInSession.user, id: 'bob', nickname: '코치' } : null,
    };
    await replaceSession(client, next);
    await pending;
    expect(cancelled).toBe(true);
    expect(
      client
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual([sessionOptions().queryKey]);
    expect(client.getQueryData(sessionOptions().queryKey)).toEqual(next);
    client.clear();
  });

  it('removes private data on logout while keeping public authentication configuration', async () => {
    const client = new QueryClient();
    client.setQueryData(sessionOptions().queryKey, signedInSession);
    client.setQueryData(['private-history', 'alice'], { body: '이전 계정 데이터' });
    await clearAuthenticatedSession(client);
    expect(client.getQueryData(sessionOptions().queryKey)).toEqual({
      user: null,
      demoMode: true,
      googleConfigured: true,
      needsOnboarding: false,
    });
    expect(client.getQueryCache().getAll()).toHaveLength(1);
    client.clear();
  });
});

describe('native foreground session refresh', () => {
  it('clears previous private data when the WebView cookie has changed identity', async () => {
    const client = new QueryClient();
    client.setQueryData(sessionOptions().queryKey, signedInSession);
    client.setQueryData(['private-history', 'alice'], { body: '이전 비공개 메시지' });
    const next = {
      ...signedInSession,
      user: signedInSession.user ? { ...signedInSession.user, id: 'bob' } : null,
    };
    await refreshSession(client, async () => next);
    expect(client.getQueryData(['private-history', 'alice'])).toBeUndefined();
    expect(client.getQueryData(sessionOptions().queryKey)).toEqual(next);
    client.clear();
  });
  it('keeps same-identity queries available for refresh and ignores an older resume response after logout', async () => {
    const client = new QueryClient();
    client.setQueryData(sessionOptions().queryKey, signedInSession);
    client.setQueryData(['private-history', 'alice'], { body: '유지할 현재 데이터' });
    await refreshSession(client, async () => signedInSession);
    expect(client.getQueryState(['private-history', 'alice'])?.isInvalidated).toBe(true);
    let finish: (session: Session) => void = () => undefined;
    const pending = refreshSession(
      client,
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await clearAuthenticatedSession(client);
    finish(signedInSession);
    await pending;
    expect(client.getQueryData(sessionOptions().queryKey)?.user).toBeNull();
    client.clear();
  });
});

describe('automatic session query reconciliation', () => {
  it('cancels private requests and removes previous viewer snapshots before committing an automatic identity change', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(sessionOptions().queryKey, signedInSession);
    client.setQueryData(['profile-snapshot'], { text: 'old viewer data' });
    let aborted = false;
    const pending = client
      .fetchQuery({
        queryKey: ['private-in-flight'],
        queryFn: ({ signal }) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener('abort', () => {
              aborted = true;
              reject(new Error('cancelled'));
            }),
          ),
      })
      .catch(() => undefined);
    const next = {
      ...signedInSession,
      user: signedInSession.user ? { ...signedInSession.user, id: 'bob' } : null,
    };
    loadSession.mockResolvedValueOnce(next);
    const observed: string[] = [];
    const unsubscribe = client.getQueryCache().subscribe(() => {
      if (client.getQueryData<Session>(sessionOptions().queryKey)?.user?.id === 'bob') {
        expect(client.getQueryData(['profile-snapshot'])).toBeUndefined();
        observed.push('bob');
      }
    });
    await client.fetchQuery(sessionOptions());
    await pending;
    expect(aborted).toBe(true);
    expect(observed.length).toBeGreaterThan(0);
    unsubscribe();
    client.clear();
  });
  it('ignores an automatic response superseded by a more recent session write', async () => {
    const client = new QueryClient();
    client.setQueryData(sessionOptions().queryKey, signedInSession);
    let finish: (session: Session) => void = () => {};
    loadSession.mockImplementationOnce(
      () =>
        new Promise<Session>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = client.fetchQuery(sessionOptions());
    const loggedOut = { ...signedInSession, user: null };
    client.setQueryData(sessionOptions().queryKey, loggedOut);
    finish(signedInSession);
    await pending;
    expect(client.getQueryData<Session>(sessionOptions().queryKey)?.user).toBeNull();
    client.clear();
  });
});
