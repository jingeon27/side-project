import type { NativeSyntheticEvent } from 'react-native';

import { act, render, screen, waitFor } from '@testing-library/react';
import * as ExpoLinking from 'expo-linking';
import type { WebViewNativeEvent } from 'react-native-webview/lib/WebViewTypes';
import { expect, it, vi } from 'vitest';

import { currentWebViewProps, fakeWebView } from '@/test/ui/fake-web-view';

import { WebShellPage } from './WebShellPage';

const link = 'gamefeedback://ko/posts/abc';
const documentUrl = 'https://feedback.example/ko/posts/abc';
function event<T extends Record<string, unknown> = Record<string, never>>(extra: T = {} as T) {
  return {
    nativeEvent: {
      url: documentUrl,
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

it('remounts the WebView when the same cold deep link arrives after an offline failure', async () => {
  vi.mocked(ExpoLinking.getInitialURL).mockResolvedValueOnce(link);
  render(<WebShellPage />);
  await waitFor(() => expect(currentWebViewProps().source).toEqual({ uri: documentUrl }));
  act(() => currentWebViewProps().onError?.(event({ code: -1009, description: 'offline' })));
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
  const listener = vi.mocked(ExpoLinking.addEventListener).mock.calls[0]?.[1];
  if (!listener) throw new Error('Missing deep-link listener');

  act(() => listener({ url: link }));

  expect(fakeWebView.mounts).toBe(2);
  expect(currentWebViewProps().source).toEqual({ uri: documentUrl });
  expect(screen.getByLabelText('페이지 불러오는 중')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
  act(() => currentWebViewProps().onLoadEnd?.(event({ navigationType: 'other' as const })));
  expect(screen.queryByLabelText('페이지 불러오는 중')).toBeNull();
});
