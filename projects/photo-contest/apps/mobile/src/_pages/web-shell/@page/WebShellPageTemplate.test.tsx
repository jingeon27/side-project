import { Platform } from 'react-native';

import { track } from '@amplitude/analytics-react-native';
import { act, render } from '@testing-library/react';
import { addEventListener as addLinkingListener } from 'expo-linking';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { dispatchedMessages, nativeEvent, navigationState, webEvent } from '@/test/ui/bridge-messages';
import { currentWebViewProps, fakeWebView } from '@/test/ui/fake-web-view';

import { WebShellPageTemplate } from './WebShellPageTemplate';

const WEB_ORIGIN = 'https://contest.example';

function renderIosShell(initialPath: string) {
  Object.defineProperty(Platform, 'OS', { configurable: true, writable: true, value: 'ios' });
  render(
    <WebShellPageTemplate
      initialPath={initialPath}
      appVersion="1.2.3"
      analyticsDeviceId={null}
      onReady={() => undefined}
    />,
  );
  const handleUrl = vi.mocked(addLinkingListener).mock.calls[0]?.[1];
  return (url: string) => act(() => handleUrl?.({ url }));
}

function postFromWeb(data: string, url: string) {
  act(() => {
    currentWebViewProps().onMessage?.(nativeEvent({ ...navigationState(url), data }));
  });
}

function startLoading(url: string, navigationType: 'reload' | 'other') {
  act(() => {
    currentWebViewProps().onLoadStart?.(nativeEvent({ ...navigationState(url), navigationType }));
  });
}

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, writable: true, value: 'web' });
});

// iOS WebView는 source가 그대로면 다시 불러오지 않는다. 다른 화면을 다시 불러오는 중 처음 연 주소와 같은 링크가 오면
// 상태만 같은 값으로 바뀌고 링크가 사라졌다.
describe('WebShellPageTemplate 준비 전 딥링크', () => {
  it('iOS에서 다른 화면을 다시 불러오는 중 처음 연 주소와 같은 링크가 오면 WebView를 새로 만들어 그 주소를 열어야 한다', () => {
    const openLink = renderIosShell('/invite/abc');
    postFromWeb(webEvent('app.ready', { path: '/invite/abc' }), `${WEB_ORIGIN}/invite/abc`);
    postFromWeb(webEvent('navigation.changed', { path: '/groups/1' }), `${WEB_ORIGIN}/groups/1`);
    startLoading(`${WEB_ORIGIN}/groups/1`, 'reload');

    openLink('photocontest://invite/abc');

    expect(fakeWebView.mounts).toBe(2);
    expect(currentWebViewProps().source).toEqual({ uri: `${WEB_ORIGIN}/invite/abc` });
    expect(
      dispatchedMessages().some((message) => message.kind === 'event' && message.type === 'navigation.open'),
    ).toBe(false);
  });

  it('처음 연 주소를 불러오는 중 같은 링크가 오면 WebView를 다시 만들지 않아야 한다', () => {
    const openLink = renderIosShell('/invite/abc');
    startLoading(`${WEB_ORIGIN}/invite/abc`, 'other');

    openLink('photocontest://invite/abc');

    // 링크 구독이 끊겨도 아래 WebView 단언은 통과하므로 링크를 처리했는지 먼저 확인한다.
    expect(track).toHaveBeenCalledWith('deep_link_opened', { path_template: '/invite/:token' });
    expect(fakeWebView.mounts).toBe(1);
    expect(currentWebViewProps().source).toEqual({ uri: `${WEB_ORIGIN}/invite/abc` });
  });
});
