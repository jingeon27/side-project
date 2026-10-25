import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decodeWebMessage } from '@photo-contest/bridge';
import { installFakeNativeApp, type IFakeNativeApp } from '@photo-contest/bridge/test';
import { createWebBridge, type IWebBridge, type TBridgeWindow } from '@photo-contest/bridge/web';

import { MeDocument } from '@/shared/api/generated';
import { forgetAnalyticsUser } from '@/shared/model/analytics';
import { BridgeContext } from '@/shared/model/bridge';

import { readNotifiedUserId, saveNotifiedUserId } from '../lib/login-marker.helper';
import { AuthSessionSync } from './AuthSessionSync';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));
vi.mock('@/shared/model/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/model/analytics')>()),
  forgetAnalyticsUser: vi.fn(),
}));

let fake: IFakeNativeApp;
let bridge: IWebBridge;
let posted: unknown[];

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
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

describe('AuthSessionSync 세션 만료', () => {
  it('알린 사용자의 세션이 끝나면 앱에 비로그인을 알리고 분석 사용자를 지워야 한다', async () => {
    saveNotifiedUserId('user-1');
    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: new MockLink([{ request: { query: MeDocument }, result: { data: { me: null } } }]),
    });
    render(
      <ApolloProvider client={client}>
        <BridgeContext value={bridge}>
          <AuthSessionSync />
        </BridgeContext>
      </ApolloProvider>,
    );

    await waitFor(() =>
      expect(posted).toContainEqual(
        expect.objectContaining({ type: 'auth.changed', payload: { signedIn: false } }),
      ),
    );
    expect(forgetAnalyticsUser).toHaveBeenCalledTimes(1);
    expect(readNotifiedUserId()).toBeNull();
  });
});
