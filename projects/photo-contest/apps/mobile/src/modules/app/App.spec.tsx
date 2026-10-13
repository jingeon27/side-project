import { render, screen, waitFor } from '@testing-library/react';
import { getInitialURL } from 'expo-linking';
import { hideAsync } from 'expo-splash-screen';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { nativeEvent, navigationState } from '@/test/ui/bridge-messages';
import { currentWebViewProps, fakeWebView } from '@/test/ui/fake-web-view';

import { App } from './App';

const WEB_ORIGIN = 'https://contest.example';

function stubAppConfig(response: () => Promise<Response>) {
  const fetchMock = vi.fn(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('앱을 연 링크의 경로로 웹을 열고, 첫 화면이 그려지면 스플래시를 닫아야 한다', async () => {
    vi.mocked(getInitialURL).mockResolvedValue('photocontest://contests/9');
    const fetchMock = stubAppConfig(async () =>
      jsonResponse({ minimumVersion: '1.0.0', latestVersion: '1.0.0' }),
    );

    render(<App />);

    await waitFor(() => expect(fakeWebView.props?.source).toEqual({ uri: `${WEB_ORIGIN}/contests/9` }));
    expect(fetchMock).toHaveBeenCalledWith(`${WEB_ORIGIN}/backend/app/config`, expect.anything());
    expect(hideAsync).not.toHaveBeenCalled();

    currentWebViewProps().onLoadEnd?.(nativeEvent(navigationState(`${WEB_ORIGIN}/contests/9`)) as never);

    await waitFor(() => expect(hideAsync).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('새 버전으로 업데이트해 주세요')).toBeNull();
  });

  it('모르는 링크로 열렸으면 홈을 열어야 한다', async () => {
    vi.mocked(getInitialURL).mockResolvedValue('otherapp://groups/1');
    stubAppConfig(async () => jsonResponse({ minimumVersion: '1.0.0', latestVersion: '1.0.0' }));

    render(<App />);

    await waitFor(() => expect(fakeWebView.props?.source).toEqual({ uri: `${WEB_ORIGIN}/` }));
  });

  it('최소 버전보다 낮으면 웹 대신 업데이트 화면을 보여 줘야 한다', async () => {
    stubAppConfig(async () => jsonResponse({ minimumVersion: '1.1.0', latestVersion: '1.2.0' }));

    render(<App />);

    expect(await screen.findByText('새 버전으로 업데이트해 주세요')).toBeTruthy();
    expect(screen.getByText('현재 버전 1.0.0 · 필요한 버전 1.1.0 이상')).toBeTruthy();
    expect(screen.getByRole('button', { name: '업데이트하기' })).toBeTruthy();
    expect(screen.queryByTestId('web-view')).toBeNull();
    expect(hideAsync).toHaveBeenCalled();
  });

  it('버전 설정을 읽지 못하면 막지 않고 웹을 열어야 한다', async () => {
    const fetchMock = stubAppConfig(async () => {
      throw new TypeError('Network request failed');
    });

    render(<App />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(fakeWebView.props?.source).toEqual({ uri: `${WEB_ORIGIN}/` }));
    expect(screen.queryByText('새 버전으로 업데이트해 주세요')).toBeNull();
  });

  it('모듈을 읽을 때 스플래시가 저절로 닫히지 않게 막아야 한다', async () => {
    vi.resetModules();
    const splash = await import('expo-splash-screen');

    await import('./App');

    expect(splash.preventAutoHideAsync).toHaveBeenCalledTimes(1);
  });
});
