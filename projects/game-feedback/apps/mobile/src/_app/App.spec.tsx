import { fireEvent, render, screen } from '@testing-library/react';
import { AppState } from 'react-native';
import { beforeEach, expect, it, vi } from 'vitest';
import { currentWebViewProps, fakeWebView } from '@/test/ui/fake-web-view';
import { App } from './App';

const failure = vi.hoisted(() => ({ active: false }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-webview', async () => {
  const { FakeWebView } = await import('@/test/ui/fake-web-view');
  return {
    default: function WebView(props: Parameters<typeof FakeWebView>[0]) {
      if (failure.active) throw new Error('native render failed');
      return <FakeWebView {...props} />;
    },
  };
});
beforeEach(() => {
  failure.active = false;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

it('cleans up native lifecycle listeners after a render failure and restores the WebView on retry', () => {
  const remove = vi.fn();
  const subscribe = vi.spyOn(AppState, 'addEventListener').mockReturnValue({ remove });
  const { rerender } = render(<App />);
  expect(fakeWebView.mounts).toBe(1);
  failure.active = true;
  rerender(<App />);
  expect(screen.getByText('서비스 화면을 열지 못했어요')).toBeTruthy();
  expect(remove).toHaveBeenCalledOnce();
  failure.active = false;
  fireEvent.click(screen.getByRole('button', { name: '서비스 다시 열기' }));
  expect(fakeWebView.mounts).toBe(2);
  expect(subscribe).toHaveBeenCalledTimes(2);
  expect(currentWebViewProps().sharedCookiesEnabled).toBe(true);
  expect(screen.queryByText('서비스 화면을 열지 못했어요')).toBeNull();
});
