import { BRIDGE_ERROR_CODE, decodeWebMessage } from '@photo-contest/bridge';
import { NativeCapabilityError } from '@photo-contest/bridge/native';
import type { TNativeCapabilities } from '@photo-contest/bridge/native';
import { installFakeNativeApp } from '@photo-contest/bridge/test';
import type { IFakeNativeApp } from '@photo-contest/bridge/test';
import { createWebBridge } from '@photo-contest/bridge/web';
import type { IWebBridge, TBridgeWindow } from '@photo-contest/bridge/web';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { navigateDocument } from '@/shared/lib/document-navigation.helper';
import { trackEvent } from '@/shared/model/analytics';
import { BridgeContext } from '@/shared/model/bridge';
import { toast } from '@/shared/model/toast';

import { resetAuthConfigForTest } from '../model/auth-config.store';
import { LoginPanel } from './LoginPanel';

const navigation = vi.hoisted(() => ({ search: '' }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock('@/shared/lib/document-navigation.helper', () => ({ navigateDocument: vi.fn() }));
vi.mock('@/shared/model/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/model/analytics')>()),
  trackEvent: vi.fn(),
  flushAnalytics: vi.fn(async () => undefined),
}));

interface IFetchCall {
  url: string;
  body: unknown;
}

let fetchCalls: IFetchCall[];
let authConfig: Record<string, boolean> | null;
let fake: IFakeNativeApp | null;
let posted: unknown[];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function stubBackend() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      fetchCalls.push({ url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
      if (url === '/backend/auth/config')
        return authConfig ? json(200, authConfig) : json(503, { message: '잠시 후 다시 시도해 주세요.' });
      return json(200, { ok: true });
    }),
  );
}

/** 앱 WebView처럼 만들고, 웹이 앱으로 보낸 메시지를 기록한다. */
function installApp(capabilities: TNativeCapabilities) {
  fake = installFakeNativeApp(window, { capabilities, platform: 'android' });
  const win: TBridgeWindow = window;
  const native = win.ReactNativeWebView;
  win.ReactNativeWebView = {
    postMessage: (raw) => {
      posted.push(decodeWebMessage(raw));
      native?.postMessage(raw);
    },
  };
  return createWebBridge(window);
}

function renderPanel({ bridge = null, nextPath }: { bridge?: IWebBridge | null; nextPath?: string } = {}) {
  const user = userEvent.setup();
  render(
    <BridgeContext value={bridge}>
      <LoginPanel nextPath={nextPath} />
    </BridgeContext>,
  );
  return { user };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAuthConfigForTest();
  navigation.search = '';
  fetchCalls = [];
  authConfig = { developmentLogin: true, google: true, kakao: true };
  fake = null;
  posted = [];
  stubBackend();
  vi.spyOn(toast, 'error');
});

afterEach(() => {
  fake?.uninstall();
  vi.unstubAllGlobals();
});

describe('LoginPanel', () => {
  it('브라우저에서는 OAuth 시작 주소로 문서를 옮기고 돌아갈 경로를 남겨야 한다', async () => {
    navigation.search = '?next=%2Fgroups%2Fgroup-1';
    const { user } = renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Google로 계속하기' }));

    await waitFor(() => expect(navigateDocument).toHaveBeenCalledWith('/backend/auth/google'));
    expect(trackEvent).toHaveBeenCalledWith('login_started', { provider: 'google' });
    expect(JSON.parse(window.sessionStorage.getItem('photo-contest:pending-login') ?? 'null')).toEqual({
      method: 'google',
      next: '/groups/group-1',
    });
  });

  it('앱 안에서는 앱이 받은 코드를 교환하고 next 경로로 문서를 새로 열어야 한다', async () => {
    const bridge = installApp({
      'auth.socialLogin': async () => ({ code: 'c'.repeat(32), verifier: 'v'.repeat(43) }),
    });
    navigation.search = '?next=%2Fcontests%2Fcontest-1%3Fsort%3Dpopular';
    const { user } = renderPanel({ bridge });

    await user.click(await screen.findByRole('button', { name: '카카오로 계속하기' }));

    await waitFor(() => expect(navigateDocument).toHaveBeenCalledWith('/contests/contest-1?sort=popular'));
    expect(fake?.calls).toEqual([{ type: 'auth.socialLogin', payload: { provider: 'kakao' } }]);
    expect(fetchCalls).toContainEqual({
      url: '/backend/auth/app/exchange',
      body: { code: 'c'.repeat(32), verifier: 'v'.repeat(43) },
    });
    expect(posted).toContainEqual(
      expect.objectContaining({ kind: 'event', type: 'auth.changed', payload: { signedIn: true } }),
    );
    expect(navigateDocument).not.toHaveBeenCalledWith('/backend/auth/kakao');
  });

  it('앱 로그인 창을 닫으면 알림 없이 그대로 머물러야 한다', async () => {
    const bridge = installApp({
      'auth.socialLogin': async () => {
        throw new NativeCapabilityError(BRIDGE_ERROR_CODE.Cancelled, '로그인을 취소했습니다.');
      },
    });
    const { user } = renderPanel({ bridge });

    await user.click(await screen.findByRole('button', { name: 'Google로 계속하기' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Google로 계속하기' })).toBeEnabled());
    expect(toast.error).not.toHaveBeenCalled();
    expect(navigateDocument).not.toHaveBeenCalled();
    expect(fetchCalls.map((call) => call.url)).not.toContain('/backend/auth/app/exchange');
  });

  it('앱 로그인이 실패하면 토스트로 알려야 한다', async () => {
    const bridge = installApp({
      'auth.socialLogin': async () => {
        throw new NativeCapabilityError(BRIDGE_ERROR_CODE.Failed, '소셜 로그인에 실패했습니다.');
      },
    });
    const { user } = renderPanel({ bridge });

    await user.click(await screen.findByRole('button', { name: 'Google로 계속하기' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('소셜 로그인에 실패했습니다.'));
    expect(navigateDocument).not.toHaveBeenCalled();
  });

  it('닉네임 없이 시작하면 안내를 보여 주고 요청하지 않아야 한다', async () => {
    const { user } = renderPanel();

    await user.click(await screen.findByRole('button', { name: '시작하기' }));

    expect(await screen.findByText('닉네임을 입력해 주세요.')).toBeVisible();
    expect(screen.getByLabelText('닉네임')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchCalls.map((call) => call.url)).not.toContain('/backend/auth/dev');
  });

  it('개발 로그인에 성공하면 화면이 넘긴 경로로 돌아가야 한다', async () => {
    const { user } = renderPanel({ nextPath: '/invite/token-1' });

    await user.type(await screen.findByLabelText('닉네임'), ' 진건 ');
    await user.click(screen.getByRole('button', { name: '시작하기' }));

    await waitFor(() => expect(navigateDocument).toHaveBeenCalledWith('/invite/token-1'));
    expect(fetchCalls).toContainEqual({ url: '/backend/auth/dev', body: { nickname: '진건' } });
  });

  it('다른 origin으로 새는 next는 무시하고 홈으로 돌아가야 한다', async () => {
    navigation.search = '?next=%2F%2Fevil.example%2Fsteal';
    const { user } = renderPanel();

    await user.type(await screen.findByLabelText('닉네임'), '진건');
    await user.click(screen.getByRole('button', { name: '시작하기' }));

    await waitFor(() => expect(navigateDocument).toHaveBeenCalledWith('/'));
  });

  it('소셜 로그인이 실패해 돌아오면 안내를 보여 줘야 한다', async () => {
    navigation.search = '?loginError=1';
    renderPanel();

    expect(screen.getByRole('alert')).toHaveTextContent('소셜 로그인에 실패했습니다. 다시 시도해 주세요.');
  });

  it('켜진 로그인 수단만 보여 줘야 한다', async () => {
    authConfig = { developmentLogin: false, google: true, kakao: false };
    renderPanel();

    expect(await screen.findByRole('button', { name: 'Google로 계속하기' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '카카오로 계속하기' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('닉네임')).not.toBeInTheDocument();
  });

  it('로그인 방법을 불러오지 못하면 다시 시도할 수 있어야 한다', async () => {
    authConfig = null;
    const { user } = renderPanel();

    expect(await screen.findByText('로그인 방법을 불러오지 못했어요.')).toBeVisible();
    authConfig = { developmentLogin: true, google: false, kakao: false };
    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByLabelText('닉네임')).toBeVisible();
  });
});
