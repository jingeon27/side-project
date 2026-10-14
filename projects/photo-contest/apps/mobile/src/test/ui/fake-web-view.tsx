import { useEffect, useImperativeHandle } from 'react';
import type { Ref } from 'react';
import { View } from 'react-native';
import type { WebViewProps } from 'react-native-webview';
import { vi } from 'vitest';

interface IFakeWebViewHandle {
  injectJavaScript: (script: string) => void;
  goBack: () => void;
  reload: () => void;
}

interface IFakeWebViewState {
  /** 마지막으로 그린 WebView의 props */
  props: WebViewProps | null;
  /** WebView를 새로 만든 횟수 (key가 바뀌면 늘어난다) */
  mounts: number;
  handle: {
    injectJavaScript: ReturnType<typeof vi.fn<(script: string) => void>>;
    goBack: ReturnType<typeof vi.fn<() => void>>;
    reload: ReturnType<typeof vi.fn<() => void>>;
  };
}

/** react-native-webview 대역. 네이티브 WebView 대신 props와 명령 호출을 기록한다. */
export const fakeWebView: IFakeWebViewState = {
  props: null,
  mounts: 0,
  handle: { injectJavaScript: vi.fn(), goBack: vi.fn(), reload: vi.fn() },
};

export function resetFakeWebView() {
  fakeWebView.props = null;
  fakeWebView.mounts = 0;
  fakeWebView.handle.injectJavaScript.mockReset();
  fakeWebView.handle.goBack.mockReset();
  fakeWebView.handle.reload.mockReset();
}

/** 지금 그려진 WebView의 props. 그려지지 않았으면 테스트를 실패시킨다. */
export function currentWebViewProps() {
  if (!fakeWebView.props) throw new Error('WebView가 그려지지 않았습니다.');
  return fakeWebView.props;
}

export function FakeWebView({ ref, ...props }: WebViewProps & { ref?: Ref<IFakeWebViewHandle> }) {
  useImperativeHandle(ref, () => fakeWebView.handle, []);
  useEffect(() => {
    fakeWebView.props = props;
  });
  useEffect(() => {
    fakeWebView.mounts += 1;
    return () => {
      fakeWebView.props = null;
    };
  }, []);
  return <View testID="web-view" />;
}
