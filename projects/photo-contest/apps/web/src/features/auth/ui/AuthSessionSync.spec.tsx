import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { decodeWebMessage } from '@photo-contest/bridge';
import { installFakeNativeApp } from '@photo-contest/bridge/test';
import type { IFakeNativeApp } from '@photo-contest/bridge/test';
import { createWebBridge } from '@photo-contest/bridge/web';
import type { IWebBridge, TBridgeWindow } from '@photo-contest/bridge/web';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MeDocument } from '@/shared/api/generated';
import type { MeQuery } from '@/shared/api/generated';
import { identifyUser, trackEvent } from '@/shared/model/analytics';
import { BridgeContext } from '@/shared/model/bridge';

import { savePendingLogin, saveNotifiedUserId } from '../lib/login-marker.helper';
import { AuthSessionSync } from './AuthSessionSync';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
  forward: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/shared/model/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/model/analytics')>()),
  trackEvent: vi.fn(),
  identifyUser: vi.fn(),
}));

const ME: NonNullable<MeQuery['me']> = { __typename: 'User', id: 'user-1', nickname: '진건', avatar: null };

let fake: IFakeNativeApp;
let bridge: IWebBridge;
let posted: unknown[];

function renderSync(me: MeQuery['me']) {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new MockLink([{ request: { query: MeDocument }, result: { data: { me } } }]),
  });
  render(
    <ApolloProvider client={client}>
      <BridgeContext value={bridge}>
        <AuthSessionSync />
      </BridgeContext>
    </ApolloProvider>,
  );
}

const authEvents = () =>
  posted.filter(
    (message) =>
      typeof message === 'object' && message !== null && Reflect.get(message, 'type') === 'auth.changed',
  );

beforeEach(() => {
  vi.clearAllMocks();
  posted = [];
  fake = installFakeNativeApp(window, { capabilities: {} });
  const win: TBridgeWindow = window;
  win.ReactNativeWebView = { postMessage: (raw) => posted.push(decodeWebMessage(raw)) };
  bridge = createWebBridge(window);
});

afterEach(() => {
  bridge.dispose();
  fake.uninstall();
});

describe('AuthSessionSync', () => {
  it('OAuth로 홈에 돌아오면 로그인 성공을 보내고 가려던 경로로 옮겨야 한다', async () => {
    savePendingLogin({ method: 'google', next: '/groups/group-1' });
    renderSync(ME);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/groups/group-1', undefined));
    expect(trackEvent).toHaveBeenCalledWith('login_succeeded', { provider: 'google' });
    expect(identifyUser).toHaveBeenCalledWith('user-1');
    expect(authEvents()).toEqual([
      expect.objectContaining({ payload: { signedIn: true, userId: 'user-1' } }),
    ]);
    expect(window.sessionStorage.getItem('photo-contest:pending-login')).toBeNull();
  });

  it('이미 알린 사용자면 앱에 다시 알리지 않아야 한다', async () => {
    saveNotifiedUserId('user-1');
    renderSync(ME);

    await waitFor(() => expect(identifyUser).toHaveBeenCalledWith('user-1'));
    expect(authEvents()).toEqual([]);
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('로그인이 끝나지 않았으면(비로그인) 표시만 지우고 아무것도 보내지 않아야 한다', async () => {
    savePendingLogin({ method: 'kakao', next: '/me' });
    renderSync(null);

    await waitFor(() => expect(window.sessionStorage.getItem('photo-contest:pending-login')).toBeNull());
    expect(trackEvent).not.toHaveBeenCalled();
    expect(identifyUser).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(authEvents()).toEqual([]);
  });
});
