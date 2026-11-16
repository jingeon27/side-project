import { Suspense } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, type Session } from '@/shared/api';
import { ServiceErrorBoundary } from '@/shared/ui';

import { sessionOptions } from '../model/auth.options';
import { SessionProvider, useSession } from './SessionProvider';

const { loadSession } = vi.hoisted(() => ({ loadSession: vi.fn() }));
vi.mock('../api/auth.api', () => ({ fetchSession: loadSession }));

const session: Session = {
  user: {
    id: 'draft-author',
    nickname: '작성자',
    isVerified: false,
    supercellTag: null,
    isTestAccount: false,
    role: 'USER',
    createdAt: '2026-11-12T00:00:00.000Z',
    verifiedAt: null,
  },
  demoMode: false,
  googleConfigured: true,
  needsOnboarding: false,
};
const clients: QueryClient[] = [];

function Draft() {
  const { session } = useSession();
  return (
    <>
      <output aria-label="현재 계정">{session.user?.id ?? 'anonymous'}</output>
      <input aria-label="작성 중인 제목" />
    </>
  );
}

function renderSession(initialSession?: Session) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  clients.push(client);
  if (initialSession) client.setQueryData(sessionOptions().queryKey, initialSession);
  render(
    <QueryClientProvider client={client}>
      <ServiceErrorBoundary title="서비스 연결">
        <Suspense fallback={<p>세션 확인 중</p>}>
          <SessionProvider onLogin={vi.fn()}>
            <Draft />
          </SessionProvider>
        </Suspense>
      </ServiceErrorBoundary>
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  loadSession.mockReset().mockResolvedValue(session);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('session refresh draft recovery', () => {
  it.each([
    new ApiError(503, 'UNAVAILABLE', '일시적인 연결 실패'),
    new ApiError(408, 'REQUEST_TIMEOUT', '요청 시간 초과'),
    new ApiError(429, 'RATE_LIMITED', '잠시 후 재시도'),
  ])('keeps a draft mounted after a cached-session refresh fails: %s', async (error) => {
    const client = renderSession(session);
    await waitFor(() => expect(client.isFetching()).toBe(0));
    const draft = screen.getByRole<HTMLInputElement>('textbox', { name: '작성 중인 제목' });
    fireEvent.change(draft, { target: { value: '저장하지 않은 제목' } });
    loadSession.mockRejectedValueOnce(error);
    await act(async () => {
      await client.invalidateQueries(sessionOptions());
    });
    await waitFor(() => expect(client.getQueryState(sessionOptions().queryKey)?.status).toBe('error'));
    expect(screen.getByRole('textbox', { name: '작성 중인 제목' })).toBe(draft);
    expect(draft.value).toBe('저장하지 않은 제목');
    expect(screen.queryByRole('alert')).toBeNull();

    await act(async () => {
      await client.invalidateQueries(sessionOptions());
    });
    await waitFor(() => expect(client.getQueryState(sessionOptions().queryKey)?.status).toBe('success'));
    expect(screen.getByRole('textbox', { name: '작성 중인 제목' })).toBe(draft);
    expect(draft.value).toBe('저장하지 않은 제목');
  });

  it('keeps the draft after a classified fetch failure and recovers on the next request', async () => {
    const auth = await vi.importActual<typeof import('../api/auth.api')>('../api/auth.api');
    const client = renderSession(session);
    await waitFor(() => expect(client.isFetching()).toBe(0));
    const draft = screen.getByRole<HTMLInputElement>('textbox', { name: '작성 중인 제목' });
    fireEvent.change(draft, { target: { value: '연결 실패 전 초안' } });
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify(session), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    loadSession.mockImplementationOnce(auth.fetchSession).mockImplementationOnce(auth.fetchSession);
    await act(async () => {
      await client.invalidateQueries(sessionOptions());
    });
    await waitFor(() =>
      expect(client.getQueryState(sessionOptions().queryKey)?.error).toMatchObject({
        errorCode: 'NETWORK_ERROR',
        status: 0,
      }),
    );
    expect(screen.getByRole('textbox', { name: '작성 중인 제목' })).toBe(draft);
    expect(draft.value).toBe('연결 실패 전 초안');
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => {
      await client.invalidateQueries(sessionOptions());
    });
    await waitFor(() => expect(client.getQueryState(sessionOptions().queryKey)?.status).toBe('success'));
    expect(screen.getByRole('textbox', { name: '작성 중인 제목' })).toBe(draft);
    expect(draft.value).toBe('연결 실패 전 초안');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps the draft when an in-flight refresh is cancelled', async () => {
    const auth = await vi.importActual<typeof import('../api/auth.api')>('../api/auth.api');
    const client = renderSession(session);
    await waitFor(() => expect(client.isFetching()).toBe(0));
    const draft = screen.getByRole<HTMLInputElement>('textbox', { name: '작성 중인 제목' });
    fireEvent.change(draft, { target: { value: '취소 전 초안' } });
    const fetcher = vi.fn(
      (_url: RequestInfo | URL, options?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    loadSession.mockImplementationOnce(auth.fetchSession);
    await act(async () => {
      const refresh = client.invalidateQueries(sessionOptions());
      await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
      await client.cancelQueries(sessionOptions());
      await refresh;
    });
    expect(client.getQueryState(sessionOptions().queryKey)?.status).toBe('success');
    expect(screen.getByRole('textbox', { name: '작성 중인 제목' })).toBe(draft);
    expect(draft.value).toBe('취소 전 초안');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reconciles a successful expired-session response and removes the previous account cache', async () => {
    const client = renderSession(session);
    await waitFor(() => expect(client.isFetching()).toBe(0));
    client.setQueryData(['private-draft-author'], { body: '이전 계정 데이터' });
    loadSession.mockResolvedValueOnce({ ...session, user: null });
    await act(async () => {
      await client.invalidateQueries(sessionOptions());
    });
    await waitFor(() =>
      expect(screen.getByRole('status', { name: '현재 계정' }).textContent).toBe('anonymous'),
    );
    expect(client.getQueryData(['private-draft-author'])).toBeUndefined();
  });

  it.each([
    new ApiError(401, 'AUTH_REQUIRED', '인증 확인 실패'),
    new ApiError(403, 'FORBIDDEN', '접근 거절'),
    new ApiError(200, 'INVALID_API_RESPONSE', '잘못된 세션 응답'),
    new ApiError(400, 'VALIDATION_ERROR', '잘못된 세션 요청'),
    new ApiError(404, 'NOT_FOUND', '세션 경로 없음'),
    new ApiError(0, 'INVALID_REQUEST_PATH', '요청 경로 계약 오류'),
    new Error('unexpected session failure'),
    new TypeError('unexpected session shape'),
    new RangeError('unexpected session state'),
  ])(
    'does not hide authorization, contract or programming failures behind a cached session: %s',
    async (error) => {
      const client = renderSession(session);
      await waitFor(() => expect(client.isFetching()).toBe(0));
      loadSession.mockRejectedValueOnce(error);
      await act(async () => {
        await client.invalidateQueries(sessionOptions());
      });
      expect(await screen.findByRole('alert', { name: '서비스 연결 오류' })).toBeTruthy();
      expect(screen.queryByRole('status', { name: '현재 계정' })).toBeNull();
    },
  );

  it('keeps initial session failures recoverable when no cached session exists', async () => {
    loadSession.mockRejectedValueOnce(new ApiError(503, 'UNAVAILABLE', '일시적인 연결 실패'));
    renderSession();
    expect(await screen.findByRole('alert', { name: '서비스 연결 오류' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(await screen.findByRole('textbox', { name: '작성 중인 제목' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
