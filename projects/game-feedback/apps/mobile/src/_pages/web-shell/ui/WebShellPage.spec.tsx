import {
  AppState,
  BackHandler,
  Linking,
  Platform,
  type AppStateStatus,
  type NativeSyntheticEvent,
} from 'react-native';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as ExpoLinking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { WebViewNativeEvent } from 'react-native-webview/lib/WebViewTypes';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { currentWebViewProps, fakeWebView } from '@/test/ui/fake-web-view';

import { WebShellPage } from './WebShellPage';

const url = 'https://feedback.example/ko';
function event<T extends Record<string, unknown> = Record<string, never>>(extra: T = {} as T) {
  return {
    nativeEvent: {
      url,
      canGoBack: false,
      loading: false,
      title: '',
      canGoForward: false,
      lockIdentifier: 0,
      ...extra,
    },
    preventDefault: vi.fn(),
  } as unknown as NativeSyntheticEvent<WebViewNativeEvent & T>;
}
afterEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
});
describe('mobile WebView shell', () => {
  it('keeps the automatic language entry when the first document is recreated before redirect', () => {
    render(<WebShellPage />);
    act(() =>
      currentWebViewProps().onNavigationStateChange?.({
        ...event().nativeEvent,
        url: 'https://feedback.example/',
        navigationType: 'other',
      }),
    );
    act(() => currentWebViewProps().onRenderProcessGone?.(event({ didCrash: true })));
    expect(currentWebViewProps().source).toEqual({ uri: 'https://feedback.example/' });
  });
  it('disables swipe history while an overlay is open and remembers normalized query locations', () => {
    render(<WebShellPage />);
    act(() =>
      currentWebViewProps().onMessage?.(
        event({ data: JSON.stringify({ type: 'navigation-state', overlayOpen: true }) }),
      ),
    );
    expect(currentWebViewProps().allowsBackForwardNavigationGestures).toBe(false);
    act(() =>
      currentWebViewProps().onMessage?.(
        event({ data: JSON.stringify({ type: 'location', path: '/ko?tab=unanswered&q=hog' }) }),
      ),
    );
    act(() => currentWebViewProps().onError?.(event({ code: -1009, description: 'offline' })));
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(currentWebViewProps().source).toEqual({ uri: 'https://feedback.example/ko?tab=unanswered&q=hog' });
    expect(currentWebViewProps().allowsBackForwardNavigationGestures).toBe(true);
  });
  it('owns safe-area chrome and enables cookie persistence, strict policy and early bootstrap', () => {
    render(<WebShellPage />);
    const props = currentWebViewProps();
    expect(props.source).toEqual({ uri: 'https://feedback.example/' });
    expect(props.originWhitelist).toEqual(['*']);
    expect(props.sharedCookiesEnabled).toBe(true);
    expect(props.thirdPartyCookiesEnabled).toBe(true);
    expect(props.setSupportMultipleWindows).toBe(false);
    expect(props.contentInsetAdjustmentBehavior).toBe('never');
    expect(props.applicationNameForUserAgent).toBe('GameFeedbackApp/1.0.0');
    expect(props.injectedJavaScriptBeforeContentLoaded).toContain('__GAME_FEEDBACK_APP__');
    expect(props.webviewDebuggingEnabled).toBe(true);
  });
  it('applies the same synchronous policy to normal and new-window navigation', () => {
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<WebShellPage />);
    expect(
      currentWebViewProps().onShouldStartLoadWithRequest?.({
        ...event().nativeEvent,
        navigationType: 'click',
        isTopFrame: true,
        url: 'javascript:alert(1)',
      }),
    ).toBe(false);
    act(() => currentWebViewProps().onOpenWindow?.(event({ targetUrl: 'https://example.com/help' })));
    expect(open).toHaveBeenCalledWith('https://example.com/help');
    act(() =>
      currentWebViewProps().onOpenWindow?.(event({ targetUrl: 'https://feedback.example/ko/guide' })),
    );
    expect(currentWebViewProps().source).toEqual({ uri: 'https://feedback.example/ko/guide' });
  });
  it('does not open external apps or app screens from an iOS subframe navigation', () => {
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<WebShellPage />);
    act(() => currentWebViewProps().onMessage?.(event({ data: JSON.stringify({ type: 'ready' }) })));
    fakeWebView.handle.injectJavaScript.mockClear();
    const frame = (target: string) =>
      currentWebViewProps().onShouldStartLoadWithRequest?.({
        ...event().nativeEvent,
        navigationType: 'other',
        isTopFrame: false,
        url: target,
      });
    expect(frame('https://example.com/ad')).toBe(false);
    expect(frame('mailto:help@example.com')).toBe(false);
    expect(frame('gamefeedback://ko/settings')).toBe(false);
    expect(frame('https://feedback.example/ko/guide')).toBe(true);
    expect(frame('about:blank')).toBe(true);
    expect(open).not.toHaveBeenCalled();
    expect(fakeWebView.handle.injectJavaScript).not.toHaveBeenCalled();
    expect(currentWebViewProps().source).toEqual({ uri: 'https://feedback.example/' });
  });
  it('renders connection failures and recreates the last document on retry', () => {
    render(<WebShellPage />);
    act(() =>
      currentWebViewProps().onNavigationStateChange?.({
        ...event({ url: 'https://feedback.example/ko/messages' }).nativeEvent,
        navigationType: 'click',
      }),
    );
    const error = event({ code: -1009, description: 'offline' });
    act(() => currentWebViewProps().onError?.(error));
    expect(error.preventDefault).toHaveBeenCalled();
    expect(screen.getByText('연결을 확인해 주세요')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(fakeWebView.mounts).toBe(2);
    expect(currentWebViewProps().source).toEqual({ uri: 'https://feedback.example/ko/messages' });
  });
  it('ignores navigation cancellation and 4xx, then displays main-document 5xx', () => {
    render(<WebShellPage />);
    act(() => currentWebViewProps().onError?.(event({ code: -999, description: 'cancelled' })));
    act(() => currentWebViewProps().onHttpError?.(event({ statusCode: 404, description: 'missing' })));
    expect(screen.queryByText('연결을 확인해 주세요')).toBeNull();
    act(() => currentWebViewProps().onHttpError?.(event({ statusCode: 503, description: 'unavailable' })));
    expect(screen.getByText('연결을 확인해 주세요')).toBeTruthy();
  });
  it('recreates an Android renderer and reloads a terminated iOS content process', () => {
    render(<WebShellPage />);
    act(() => currentWebViewProps().onRenderProcessGone?.({ nativeEvent: { didCrash: true } } as never));
    expect(fakeWebView.mounts).toBe(2);
    act(() => currentWebViewProps().onContentProcessDidTerminate?.(event()));
    expect(fakeWebView.handle.reload).toHaveBeenCalledOnce();
  });
  it('rejects native messages from foreign frames and runs system auth for trusted requests', async () => {
    render(<WebShellPage />);
    act(() =>
      currentWebViewProps().onMessage?.(
        event({ url: 'https://evil.example', data: JSON.stringify({ type: 'auth-request', id: 'evil' }) }),
      ),
    );
    expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
    act(() =>
      currentWebViewProps().onMessage?.(
        event({ data: JSON.stringify({ type: 'auth-request', id: 'auth-1' }) }),
      ),
    );
    await waitFor(() => expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(fakeWebView.handle.injectJavaScript).toHaveBeenCalledWith(expect.stringContaining('cancelled')),
    );
  });
  it('opens cold deep links as the initial source and warm links through the bridge', async () => {
    vi.mocked(ExpoLinking.getInitialURL).mockResolvedValueOnce('gamefeedback://ko/posts/abc');
    render(<WebShellPage />);
    await waitFor(() =>
      expect(currentWebViewProps().source).toEqual({ uri: 'https://feedback.example/ko/posts/abc' }),
    );
    act(() => currentWebViewProps().onMessage?.(event({ data: JSON.stringify({ type: 'ready' }) })));
    const listener = vi.mocked(ExpoLinking.addEventListener).mock.calls[0]?.[1];
    if (!listener) throw new Error('Missing deep-link listener');
    act(() => listener({ url: 'gamefeedback://ko/settings' }));
    expect(fakeWebView.handle.injectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('"path":"/ko/settings"'),
    );
  });
  it('resets iOS document readiness on reload while preserving Android pushState readiness', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const ios = render(<WebShellPage />);
    act(() => currentWebViewProps().onMessage?.(event({ data: JSON.stringify({ type: 'ready' }) })));
    act(() => currentWebViewProps().onLoadStart?.(event({ navigationType: 'reload' as const })));
    const iosLink = vi.mocked(ExpoLinking.addEventListener).mock.calls.at(-1)?.[1];
    if (!iosLink) throw new Error('Missing iOS link listener');
    act(() => iosLink({ url: 'gamefeedback://ko/settings' }));
    expect(currentWebViewProps().source).toEqual({ uri: 'https://feedback.example/ko/settings' });
    expect(fakeWebView.handle.injectJavaScript).not.toHaveBeenCalled();
    ios.unmount();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    vi.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove: vi.fn() });
    render(<WebShellPage />);
    act(() => currentWebViewProps().onMessage?.(event({ data: JSON.stringify({ type: 'ready' }) })));
    act(() => currentWebViewProps().onLoadStart?.(event({ navigationType: 'other' as const })));
    const androidLink = vi.mocked(ExpoLinking.addEventListener).mock.calls.at(-1)?.[1];
    if (!androidLink) throw new Error('Missing Android link listener');
    act(() => androidLink({ url: 'gamefeedback://ko/guide' }));
    expect(fakeWebView.handle.injectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('"path":"/ko/guide"'),
    );
  });

  it('asks the web before Android back, ignores duplicate presses and falls back to history', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    let press = () => false;
    vi.spyOn(BackHandler, 'addEventListener').mockImplementation((_type, listener) => {
      press = () => listener({} as never) ?? false;
      return { remove: vi.fn() };
    });
    const exit = vi.spyOn(BackHandler, 'exitApp').mockImplementation(() => undefined);
    render(<WebShellPage />);
    act(() => currentWebViewProps().onMessage?.(event({ data: JSON.stringify({ type: 'ready' }) })));
    act(() =>
      currentWebViewProps().onNavigationStateChange?.({
        ...event({ canGoBack: true }).nativeEvent,
        navigationType: 'click',
      }),
    );
    act(() => {
      expect(press()).toBe(true);
      press();
    });
    expect(fakeWebView.handle.injectJavaScript).toHaveBeenCalledTimes(1);
    act(() =>
      currentWebViewProps().onMessage?.(
        event({ data: JSON.stringify({ type: 'back-result', id: 'back-1', handled: false }) }),
      ),
    );
    await waitFor(() => expect(fakeWebView.handle.goBack).toHaveBeenCalledOnce());
    expect(exit).not.toHaveBeenCalled();
  });
  it('emits foreground only after background and removes OS listeners on unmount', () => {
    let change: (state: AppStateStatus) => void = () => undefined;
    const remove = vi.fn();
    vi.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      change = listener;
      return { remove };
    });
    const rendered = render(<WebShellPage />);
    act(() => currentWebViewProps().onMessage?.(event({ data: JSON.stringify({ type: 'ready' }) })));
    act(() => {
      change('inactive');
      change('active');
    });
    expect(fakeWebView.handle.injectJavaScript).not.toHaveBeenCalled();
    act(() => {
      change('background');
      change('active');
    });
    expect(fakeWebView.handle.injectJavaScript).toHaveBeenCalledTimes(2);
    rendered.unmount();
    expect(remove).toHaveBeenCalledOnce();
  });
  it('subscribes to channel updates without reinstalling OS listeners and detaches the WebView on unmount', () => {
    const states = vi.spyOn(AppState, 'addEventListener');
    const rendered = render(<WebShellPage />);
    expect(screen.getByLabelText('페이지 불러오는 중')).toBeTruthy();
    act(() => currentWebViewProps().onMessage?.(event({ data: JSON.stringify({ type: 'ready' }) })));
    expect(screen.queryByLabelText('페이지 불러오는 중')).toBeNull();
    act(() =>
      currentWebViewProps().onMessage?.(
        event({ data: JSON.stringify({ type: 'navigation-state', overlayOpen: true }) }),
      ),
    );
    expect(currentWebViewProps().allowsBackForwardNavigationGestures).toBe(false);
    expect(ExpoLinking.addEventListener).toHaveBeenCalledOnce();
    expect(states).toHaveBeenCalledOnce();

    const reload = currentWebViewProps().onContentProcessDidTerminate;
    rendered.unmount();
    act(() => reload?.(event()));
    expect(fakeWebView.handle.reload).not.toHaveBeenCalled();
  });
});
