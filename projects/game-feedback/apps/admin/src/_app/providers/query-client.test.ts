import {
  environmentManager,
  InfiniteQueryObserver,
  MutationObserver,
  QueryObserver,
} from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminLoginInputSchema, SessionSchema, SupportThreadSchema } from '@game-feedback/contracts';

import {
  AdminSessionExpiredError,
  loginMutationOptions,
  logoutMutationOptions,
  sessionOptions,
} from '@/features/auth';
import { replyMutationOptions, threadListOptions } from '@/features/support';

import { createQueryClient } from './query-client';

const anonymous = SessionSchema.parse({
  user: null,
  demoMode: false,
  googleConfigured: false,
  needsOnboarding: false,
});
const admin = SessionSchema.parse({
  ...anonymous,
  user: {
    id: 'administrator',
    nickname: '운영자',
    role: 'ADMIN',
    isVerified: false,
    supercellTag: null,
    isTestAccount: false,
    createdAt: '2026-11-11T00:00:00.000Z',
    verifiedAt: null,
  },
});
const thread = SupportThreadSchema.parse({
  id: 'support-1',
  conversationId: 'conversation-1',
  requester: {
    id: 'user-1',
    nickname: '문의자',
    isVerified: false,
    supercellTag: null,
    isTestAccount: false,
  },
  adminId: 'administrator',
  topic: 'GENERAL',
  status: 'OPEN',
  createdAt: '2026-11-11T00:00:00.000Z',
  updatedAt: '2026-11-11T00:00:00.000Z',
});
const sessionKey = sessionOptions().queryKey;
// Node에서 query-core는 서버로 보고 gcTime 기본값을 Infinity로 둔다. 기본값에 기대는 테스트만 브라우저처럼 바꾼다.
const nodeRuntime = environmentManager.isServer();

// 관리자 쿠키의 유효 여부와 연결 상태만 흉내 낸다. SDK 요청과 응답 검증은 실제 코드를 탄다.
const api = { signedIn: true, reachable: true, requests: [] as string[] };
const respond = (body: unknown, status = 200) => Response.json(body, { status });
const sessionChecks = () => api.requests.filter((request) => request === 'GET /api/admin/auth/session');

beforeEach(() => {
  api.signedIn = true;
  api.reachable = true;
  api.requests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const [path] = String(input).split('?');
      api.requests.push(`${method} ${path}`);
      if (!api.reachable) throw new TypeError('Failed to fetch');
      if (path === '/api/admin/auth/session') return respond(api.signedIn ? admin : anonymous);
      if (path === '/api/admin/auth/logout') {
        api.signedIn = false;
        return respond({ ok: true });
      }
      if (path === '/api/admin/auth/login') {
        if (AdminLoginInputSchema.parse(JSON.parse(String(init?.body))).password !== 'correct-password')
          return respond(
            { errorCode: 'INVALID_ADMIN_CREDENTIALS', message: '아이디 또는 비밀번호를 확인해주세요.' },
            401,
          );
        api.signedIn = true;
        return respond(admin);
      }
      if (!api.signedIn) return respond({ errorCode: 'AUTH_REQUIRED', message: '로그인이 필요합니다.' }, 401);
      if (path === '/api/admin/support') return respond({ items: [thread], nextCursor: null });
      throw new Error(`Unexpected request ${method} ${path}`);
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  environmentManager.setIsServer(() => nodeRuntime);
  vi.unstubAllGlobals();
});

/** 라우터처럼 세션을 구독한 관리자 화면 */
async function signedInClient() {
  const client = createQueryClient();
  await client.fetchQuery(sessionOptions());
  const unsubscribe = new QueryObserver(client, sessionOptions()).subscribe(() => undefined);
  return {
    client,
    close: () => {
      unsubscribe();
      client.clear();
    },
  };
}

describe('expired admin session', () => {
  it('turns a failed inbox poll into an expired session and keeps the previous admin and inbox data', async () => {
    const { client, close } = await signedInClient();
    const inbox = new InfiniteQueryObserver(client, { ...threadListOptions('ALL'), retry: false });
    const stop = inbox.subscribe(() => undefined);
    await vi.waitFor(() => expect(inbox.getCurrentResult().data?.pages[0]?.items).toEqual([thread]));
    api.signedIn = false;

    await inbox.refetch();

    expect(inbox.getCurrentResult()).toMatchObject({
      isRefetchError: true,
      data: { pages: [{ items: [thread] }] },
    });
    await vi.waitFor(() =>
      expect(client.getQueryState(sessionKey)?.error).toBeInstanceOf(AdminSessionExpiredError),
    );
    expect(client.getQueryData(sessionKey)).toEqual(admin);
    expect(sessionChecks()).toHaveLength(2);
    stop();
    close();
  });

  it('keeps the hidden screen data past the default gc time while the session is expired', async () => {
    environmentManager.setIsServer(() => false);
    vi.useFakeTimers();
    const { client, close } = await signedInClient();
    const inbox = new InfiniteQueryObserver(client, { ...threadListOptions('ALL'), retry: false });
    const stop = inbox.subscribe(() => undefined);
    await vi.waitFor(() => expect(inbox.getCurrentResult().data?.pages[0]?.items).toEqual([thread]));
    api.signedIn = false;
    await inbox.refetch();
    await vi.waitFor(() =>
      expect(client.getQueryState(sessionKey)?.error).toBeInstanceOf(AdminSessionExpiredError),
    );

    // 라우터가 셸을 숨기면 효과가 정리되어 문의함 관찰자가 사라진다.
    stop();
    await vi.advanceTimersByTimeAsync(6 * 60_000);

    expect(client.getQueryData(threadListOptions('ALL').queryKey)?.pages[0]?.items).toEqual([thread]);
    close();
  });

  it('rechecks the session before a reply rejected with 401 reaches the form', async () => {
    const { client, close } = await signedInClient();
    api.signedIn = false;

    await expect(
      new MutationObserver(client, replyMutationOptions(client, thread.conversationId)).mutate({
        conversationId: thread.conversationId,
        body: '확인 후 안내드릴게요.',
        clientMessageId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toMatchObject({ status: 401, errorCode: 'AUTH_REQUIRED' });

    expect(client.getQueryState(sessionKey)?.error).toBeInstanceOf(AdminSessionExpiredError);
    expect(client.getQueryData(sessionKey)).toEqual(admin);
    close();
  });

  it('does not recheck the session when the password is wrong', async () => {
    const client = createQueryClient();
    client.setQueryData(sessionKey, anonymous);
    // 라우터처럼 세션을 구독해야 잘못된 재확인이 요청으로 드러난다.
    const stop = new QueryObserver(client, sessionOptions()).subscribe(() => undefined);
    api.signedIn = false;

    await expect(
      new MutationObserver(client, loginMutationOptions(client)).mutate({
        username: 'admin',
        password: 'wrong-password',
      }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_ADMIN_CREDENTIALS' });

    expect(api.requests).toEqual(['POST /api/admin/auth/login']);
    expect(client.getQueryState(sessionKey)?.error).toBeNull();
    stop();
    client.clear();
  });

  it('stays expired when the session recheck fails after expiry but not before it', async () => {
    const { client, close } = await signedInClient();
    api.reachable = false;
    await client.refetchQueries(sessionOptions());
    expect(client.getQueryState(sessionKey)?.error).toBeInstanceOf(TypeError);

    api.reachable = true;
    api.signedIn = false;
    await client.refetchQueries(sessionOptions());
    api.reachable = false;
    await client.refetchQueries(sessionOptions());

    expect(client.getQueryState(sessionKey)?.error).toBeInstanceOf(AdminSessionExpiredError);
    expect(client.getQueryData(sessionKey)).toEqual(admin);
    close();
  });

  it('clears the expired state after logging in again and keeps an explicit logout anonymous', async () => {
    const { client, close } = await signedInClient();
    api.signedIn = false;
    await client.refetchQueries(sessionOptions());
    expect(client.getQueryState(sessionKey)?.error).toBeInstanceOf(AdminSessionExpiredError);

    await new MutationObserver(client, loginMutationOptions(client)).mutate({
      username: 'admin',
      password: 'correct-password',
    });
    expect(client.getQueryState(sessionKey)).toMatchObject({ status: 'success', error: null, data: admin });

    await new MutationObserver(client, logoutMutationOptions(client)).mutate();
    await client.refetchQueries(sessionOptions());
    expect(client.getQueryState(sessionKey)).toMatchObject({
      status: 'success',
      error: null,
      data: anonymous,
    });
    close();
  });
});
