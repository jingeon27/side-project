import { AppState, BackHandler, Platform, Share } from 'react-native';

import { getUserId, reset, setUserId, track } from '@amplitude/analytics-react-native';
import { captureMessage } from '@sentry/react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setStringAsync } from 'expo-clipboard';
import { addEventListener as addLinkingListener, openURL } from 'expo-linking';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseNativeAppInfo } from '@photo-contest/bridge';

import {
  dispatchedMessages,
  nativeEvent,
  navigationState,
  webEvent,
  webRequest,
  webResponse,
} from '@/test/ui/bridge-messages';
import { currentWebViewProps, fakeWebView } from '@/test/ui/fake-web-view';

import { WebShellPageTemplate } from './WebShellPageTemplate';

const WEB_ORIGIN = 'https://contest.example';

function renderShell(initialPath = '/', analyticsDeviceId: string | null = null) {
  const onReady = vi.fn();
  render(
    <WebShellPageTemplate
      initialPath={initialPath}
      appVersion="1.2.3"
      analyticsDeviceId={analyticsDeviceId}
      onReady={onReady}
    />,
  );
  return { onReady };
}

function readAppInfo() {
  const fakeWindow: Record<string, unknown> = {};
  new Function('window', currentWebViewProps().injectedJavaScriptBeforeContentLoaded ?? '')(fakeWindow);
  return parseNativeAppInfo(fakeWindow.__PHOTO_CONTEST_APP__);
}

function trackedEvents() {
  return vi.mocked(track).mock.calls.map(([name, properties]) => ({ name, properties }));
}

function shouldStart(url: string, isTopFrame = true) {
  return currentWebViewProps().onShouldStartLoadWithRequest?.({
    ...navigationState(url),
    navigationType: 'click',
    isTopFrame,
  });
}

function postFromWeb(data: string, url = `${WEB_ORIGIN}/`) {
  act(() => {
    currentWebViewProps().onMessage?.(nativeEvent({ ...navigationState(url), data }));
  });
}

function readyWeb(path = '/') {
  postFromWeb(webEvent('app.ready', { path }));
}

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, writable: true, value: 'web' });
});

describe('WebShellPageTemplate', () => {
  it('첫 경로를 웹 origin으로 열고 앱 User-Agent와 앱 정보를 넘겨야 한다', () => {
    renderShell('/invite/abc');

    const props = currentWebViewProps();
    expect(props.source).toEqual({ uri: `${WEB_ORIGIN}/invite/abc` });
    expect(props.applicationNameForUserAgent).toBe('PhotoContestApp/1.2.3');
    expect(props.originWhitelist).toEqual(['*']);
    expect(props).toMatchObject({
      setSupportMultipleWindows: false,
      sharedCookiesEnabled: true,
      thirdPartyCookiesEnabled: true,
      allowsBackForwardNavigationGestures: true,
      pullToRefreshEnabled: true,
      webviewDebuggingEnabled: true,
      contentInsetAdjustmentBehavior: 'never',
    });

    expect(readAppInfo()).toEqual({
      platform: 'android',
      appVersion: '1.2.3',
      protocolVersion: 1,
      capabilities: ['share.open', 'clipboard.copy', 'haptics.impact', 'link.open', 'auth.socialLogin'],
    });
  });

  it('분석 기기 ID가 있으면 앱 정보에 실어 웹이 같은 기기 ID를 쓰게 해야 한다', () => {
    renderShell('/', 'amplitude-device-1');

    expect(readAppInfo()).toMatchObject({ analyticsDeviceId: 'amplitude-device-1' });
  });

  it('웹 로그인 상태에 맞춰 분석 사용자를 식별하고, 로그아웃하면 초기화해야 한다', () => {
    renderShell();

    postFromWeb(webEvent('auth.changed', { signedIn: true, userId: 'cuser1' }));
    expect(setUserId).toHaveBeenCalledWith('cuser1');

    vi.mocked(getUserId).mockReturnValue('cuser1');
    postFromWeb(webEvent('auth.changed', { signedIn: false }));
    expect(reset).toHaveBeenCalledTimes(1);

    postFromWeb(webEvent('auth.changed', { signedIn: true, userId: 'cuser9' }), 'https://evil.example/');
    expect(setUserId).toHaveBeenCalledTimes(1);
  });

  it('공유·소셜 로그인 결과를 분석 이벤트로 남겨야 한다', async () => {
    vi.spyOn(Share, 'share').mockResolvedValue({ action: 'dismissedAction' });
    renderShell();

    postFromWeb(webRequest('share-1', 'share.open', { url: `${WEB_ORIGIN}/invite/abc` }));
    postFromWeb(webRequest('login-1', 'auth.socialLogin', { provider: 'kakao' }));

    await waitFor(() =>
      expect(trackedEvents()).toEqual(
        expect.arrayContaining([
          { name: 'native_share_dismissed', properties: undefined },
          { name: 'social_login_started', properties: { provider: 'kakao' } },
          { name: 'social_login_cancelled', properties: { provider: 'kakao' } },
        ]),
      ),
    );
    expect(trackedEvents()).toHaveLength(3);
  });

  it('웹 origin만 WebView에서 열고 다른 링크는 밖에서 열거나 막아야 한다', () => {
    renderShell();

    expect(shouldStart(`${WEB_ORIGIN}/contests/1`)).toBe(true);
    expect(shouldStart('about:blank')).toBe(true);
    expect(shouldStart('https://accounts.example/login')).toBe(false);
    expect(shouldStart('tel:01012345678')).toBe(false);
    expect(shouldStart('javascript:alert(document.cookie)')).toBe(false);

    expect(vi.mocked(openURL).mock.calls).toEqual([['https://accounts.example/login'], ['tel:01012345678']]);
  });

  it('앱 스킴 링크는 웹이 준비되기 전이면 그 경로로 열고, 준비된 뒤에는 웹 라우터로 보내야 한다', () => {
    renderShell();

    let decision: boolean | undefined;
    act(() => {
      decision = shouldStart('photocontest://groups/7');
    });
    expect(decision).toBe(false);
    expect(currentWebViewProps().source).toEqual({ uri: `${WEB_ORIGIN}/groups/7` });

    readyWeb('/groups/7');
    act(() => {
      decision = shouldStart('photocontest://contests/3');
    });

    expect(decision).toBe(false);
    expect(dispatchedMessages()).toContainEqual({
      v: 1,
      kind: 'event',
      type: 'navigation.open',
      payload: { path: '/contests/3' },
    });
    expect(openURL).not.toHaveBeenCalled();
  });

  it('웹 origin의 메시지만 브리지 기능으로 처리하고 응답을 돌려줘야 한다', async () => {
    renderShell();

    postFromWeb(webRequest('evil-1', 'clipboard.copy', { text: '가로챈 문구' }), 'https://evil.example/');
    postFromWeb(webRequest('copy-1', 'clipboard.copy', { text: '초대 링크' }), `${WEB_ORIGIN}/groups/1`);

    await waitFor(() =>
      expect(dispatchedMessages()).toContainEqual({
        v: 1,
        kind: 'response',
        id: 'copy-1',
        ok: true,
        result: { copied: true },
      }),
    );
    expect(setStringAsync).toHaveBeenCalledTimes(1);
    expect(setStringAsync).toHaveBeenCalledWith('초대 링크');
    expect(dispatchedMessages().some((message) => 'id' in message && message.id === 'evil-1')).toBe(false);
  });

  it('웹의 app.ready를 받으면 로딩 화면을 닫고 스플래시를 닫게 알려야 한다', () => {
    const { onReady } = renderShell();
    expect(screen.getByTestId('loading-overlay')).toBeTruthy();

    readyWeb();

    expect(screen.queryByTestId('loading-overlay')).toBeNull();
    expect(onReady).toHaveBeenCalled();
  });

  it('웹이 알리지 않아도 문서 로딩이 끝나면 로딩 화면을 닫아야 한다', () => {
    const { onReady } = renderShell();

    act(() => {
      currentWebViewProps().onLoadEnd?.(nativeEvent(navigationState(`${WEB_ORIGIN}/`)) as never);
    });

    expect(screen.queryByTestId('loading-overlay')).toBeNull();
    expect(onReady).toHaveBeenCalled();
  });

  it('웹 문서를 불러오지 못하면 오프라인 화면을 보여 주고, 다시 시도하면 같은 주소로 새 WebView를 열어야 한다', () => {
    renderShell('/groups/1');
    const errorEvent = nativeEvent({
      ...navigationState(`${WEB_ORIGIN}/groups/1`),
      domain: 'NSURLErrorDomain',
      code: -1009,
      description: '인터넷 연결이 오프라인 상태입니다.',
    });

    act(() => {
      currentWebViewProps().onError?.(errorEvent);
    });

    expect(errorEvent.preventDefault).toHaveBeenCalled();
    expect(screen.getByText('연결할 수 없어요')).toBeTruthy();
    expect(screen.queryByTestId('web-view')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(screen.queryByText('연결할 수 없어요')).toBeNull();
    expect(fakeWebView.mounts).toBe(2);
    expect(currentWebViewProps().source).toEqual({ uri: `${WEB_ORIGIN}/groups/1` });
    expect(screen.getByTestId('loading-overlay')).toBeTruthy();
  });

  it('서버 오류(5xx)는 오프라인 화면으로, 이동 취소 오류는 무시해야 한다', () => {
    renderShell();

    act(() => {
      currentWebViewProps().onError?.(
        nativeEvent({
          ...navigationState(`${WEB_ORIGIN}/`),
          domain: 'NSURLErrorDomain',
          code: -999,
          description: '',
        }),
      );
    });
    expect(screen.queryByText('연결할 수 없어요')).toBeNull();

    act(() => {
      currentWebViewProps().onHttpError?.(
        nativeEvent({ ...navigationState(`${WEB_ORIGIN}/`), statusCode: 502, description: 'Bad Gateway' }),
      );
    });
    expect(screen.getByText('연결할 수 없어요')).toBeTruthy();
  });

  it('Android 렌더러가 죽으면 보던 주소로 WebView를 새로 만들어야 한다', () => {
    renderShell();
    readyWeb('/contests/5');

    act(() => {
      currentWebViewProps().onRenderProcessGone?.(
        nativeEvent({ ...navigationState(`${WEB_ORIGIN}/contests/5`), didCrash: true }),
      );
    });

    expect(fakeWebView.mounts).toBe(2);
    expect(currentWebViewProps().source).toEqual({ uri: `${WEB_ORIGIN}/contests/5` });
  });

  it('메인 문서 로드 실패는 상태 코드와 함께 분석 이벤트와 Sentry 경고로 남겨야 한다', () => {
    renderShell();

    act(() => {
      currentWebViewProps().onError?.(
        nativeEvent({
          ...navigationState(`${WEB_ORIGIN}/`),
          domain: 'NSURLErrorDomain',
          code: -999,
          description: '',
        }),
      );
      currentWebViewProps().onHttpError?.(
        nativeEvent({ ...navigationState(`${WEB_ORIGIN}/me`), statusCode: 404, description: 'Not Found' }),
      );
    });
    expect(track).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();

    act(() => {
      currentWebViewProps().onError?.(
        nativeEvent({
          ...navigationState(`${WEB_ORIGIN}/invite/secret_token`),
          domain: 'NSURLErrorDomain',
          code: -1009,
          description: '인터넷 연결이 오프라인 상태입니다.',
        }),
      );
    });
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    act(() => {
      currentWebViewProps().onHttpError?.(
        nativeEvent({ ...navigationState(`${WEB_ORIGIN}/`), statusCode: 503, description: 'Unavailable' }),
      );
    });

    expect(trackedEvents()).toEqual([
      { name: 'webview_load_failed', properties: { status: 0 } },
      { name: 'webview_load_failed', properties: { status: 503 } },
    ]);
    expect(vi.mocked(captureMessage).mock.calls).toEqual([
      [
        'webview_load_failed',
        { level: 'warning', tags: { status: '0', error_code: '-1009', error_domain: 'NSURLErrorDomain' } },
      ],
      ['webview_load_failed', { level: 'warning', tags: { status: '503' } }],
    ]);
  });

  it('WebView 프로세스가 끝나면 다시 띄우고, 분석 이벤트와 Sentry 경고로 남겨야 한다', () => {
    renderShell();

    act(() => {
      currentWebViewProps().onContentProcessDidTerminate?.(nativeEvent(navigationState(`${WEB_ORIGIN}/`)));
    });
    expect(fakeWebView.handle.reload).toHaveBeenCalledTimes(1);

    act(() => {
      currentWebViewProps().onRenderProcessGone?.(nativeEvent({ didCrash: false }));
    });
    expect(fakeWebView.mounts).toBe(2);

    expect(trackedEvents()).toEqual([
      { name: 'webview_process_terminated', properties: undefined },
      { name: 'webview_process_terminated', properties: undefined },
    ]);
    expect(vi.mocked(captureMessage).mock.calls).toEqual([
      ['webview_process_terminated', { level: 'warning', tags: { process: 'content' } }],
      ['webview_process_terminated', { level: 'warning', tags: { process: 'render', did_crash: 'false' } }],
    ]);
  });

  it('앱이 떠 있을 때 들어온 딥링크를 웹 이동으로 바꾸고, 로그인 콜백은 무시해야 한다', () => {
    renderShell();
    readyWeb();
    const handleUrl = vi.mocked(addLinkingListener).mock.calls[0]?.[1];

    act(() => {
      handleUrl?.({ url: 'photocontest://invite/token_1' });
      handleUrl?.({ url: 'photocontest://auth/callback?code=abcdefghijklmnop' });
      handleUrl?.({ url: `${WEB_ORIGIN}/groups/2` });
    });

    expect(
      dispatchedMessages().filter(
        (message) => message.kind === 'event' && message.type === 'navigation.open',
      ),
    ).toEqual([
      { v: 1, kind: 'event', type: 'navigation.open', payload: { path: '/invite/token_1' } },
      { v: 1, kind: 'event', type: 'navigation.open', payload: { path: '/groups/2' } },
    ]);
  });

  it('앱이 떠 있을 때 연 딥링크는 토큰·ID를 뺀 path_template으로 기록해야 한다', () => {
    renderShell();
    const handleUrl = vi.mocked(addLinkingListener).mock.calls[0]?.[1];

    act(() => {
      handleUrl?.({ url: 'photocontest://invite/secret_token' });
      handleUrl?.({ url: 'photocontest://auth/callback?code=abcdefghijklmnop' });
      handleUrl?.({ url: `${WEB_ORIGIN}/contests/cm1contest01` });
    });

    expect(trackedEvents()).toEqual([
      { name: 'deep_link_opened', properties: { path_template: '/invite/:token' } },
      { name: 'deep_link_opened', properties: { path_template: '/contests/:id' } },
    ]);
  });

  it('Android는 화면 기록이 바뀌어도(onLoadStart) 웹 준비 상태를 유지해 딥링크를 웹 라우터로 보내야 한다', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, writable: true, value: 'android' });
    renderShell();
    readyWeb();
    const handleUrl = vi.mocked(addLinkingListener).mock.calls[0]?.[1];

    act(() => {
      currentWebViewProps().onLoadStart?.(
        nativeEvent({ ...navigationState(`${WEB_ORIGIN}/groups/1`), navigationType: 'other' as const }),
      );
      handleUrl?.({ url: 'photocontest://contests/4' });
    });

    expect(currentWebViewProps().source).toEqual({ uri: `${WEB_ORIGIN}/` });
    expect(dispatchedMessages()).toContainEqual({
      v: 1,
      kind: 'event',
      type: 'navigation.open',
      payload: { path: '/contests/4' },
    });
  });

  it('iOS에서 새 문서를 열면 app.ready를 다시 받을 때까지 딥링크를 문서 이동으로 처리해야 한다', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, writable: true, value: 'ios' });
    renderShell();
    readyWeb();
    const handleUrl = vi.mocked(addLinkingListener).mock.calls[0]?.[1];

    act(() => {
      currentWebViewProps().onLoadStart?.(
        nativeEvent({ ...navigationState(`${WEB_ORIGIN}/me`), navigationType: 'click' as const }),
      );
      handleUrl?.({ url: 'photocontest://contests/4' });
    });

    expect(currentWebViewProps().source).toEqual({ uri: `${WEB_ORIGIN}/contests/4` });
    expect(
      dispatchedMessages().some((message) => message.kind === 'event' && message.type === 'navigation.open'),
    ).toBe(false);
  });

  it('앱이 background에 다녀오면 웹에 app.state를 알려야 한다', () => {
    vi.spyOn(AppState, 'currentState', 'get').mockReturnValue('active');
    const addStateListener = vi.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: vi.fn() });
    renderShell();
    readyWeb();
    const handleChange = addStateListener.mock.calls[0]?.[1];

    act(() => {
      handleChange?.('inactive');
      handleChange?.('background');
      handleChange?.('active');
    });

    expect(
      dispatchedMessages().filter((message) => message.kind === 'event' && message.type === 'app.state'),
    ).toEqual([
      { v: 1, kind: 'event', type: 'app.state', payload: { state: 'background' } },
      { v: 1, kind: 'event', type: 'app.state', payload: { state: 'active' } },
    ]);
  });

  it('background에 다녀오면 웹 준비와 상관없이 app_foregrounded를 기록해야 한다', () => {
    vi.spyOn(AppState, 'currentState', 'get').mockReturnValue('active');
    const addStateListener = vi.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: vi.fn() });
    renderShell();
    const handleChange = addStateListener.mock.calls[0]?.[1];

    act(() => {
      handleChange?.('inactive');
      handleChange?.('active');
      handleChange?.('background');
      handleChange?.('active');
    });

    expect(trackedEvents()).toEqual([{ name: 'app_foregrounded', properties: undefined }]);
    expect(
      dispatchedMessages().some((message) => message.kind === 'event' && message.type === 'app.state'),
    ).toBe(false);
  });

  it('Android 뒤로 가기는 웹에 먼저 묻고, 웹이 처리하지 않으면 WebView 기록으로 돌아가야 한다', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, writable: true, value: 'android' });
    const addBackListener = vi.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove: vi.fn() });
    const exitApp = vi.spyOn(BackHandler, 'exitApp').mockImplementation(() => undefined);
    renderShell();
    const handleBackListener = addBackListener.mock.calls[0]?.[1];
    function pressBack() {
      return handleBackListener?.({ type: 'hardwareBackPress', timeStamp: Date.now() });
    }

    // 웹이 아직 준비되지 않았고 기록도 없으면 앱을 닫는다.
    expect(pressBack()).toBe(true);
    await waitFor(() => expect(exitApp).toHaveBeenCalledTimes(1));

    readyWeb('/groups/1');
    act(() => {
      currentWebViewProps().onNavigationStateChange?.({
        ...navigationState(`${WEB_ORIGIN}/groups/1`, { canGoBack: true }),
        navigationType: 'backforward',
      });
    });

    function answerBack(handled: boolean) {
      const request = dispatchedMessages().findLast((message) => message.kind === 'request');
      if (!request || request.kind !== 'request') throw new Error('navigation.back 요청이 없습니다.');
      expect(request.type).toBe('navigation.back');
      postFromWeb(webResponse(request.id, { handled }), `${WEB_ORIGIN}/groups/1`);
    }

    pressBack();
    answerBack(true);
    await act(async () => undefined);
    expect(fakeWebView.handle.goBack).not.toHaveBeenCalled();

    pressBack();
    answerBack(false);
    await waitFor(() => expect(fakeWebView.handle.goBack).toHaveBeenCalledTimes(1));
    expect(exitApp).toHaveBeenCalledTimes(1);
  });
});
