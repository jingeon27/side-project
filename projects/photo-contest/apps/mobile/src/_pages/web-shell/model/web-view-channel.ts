import type WebView from 'react-native-webview';

export interface IWebViewChannel {
  /** WebView의 callback ref. 다시 만들 때(key 변경) 새 WebView로 바뀐다. */
  attach: (webView: WebView | null) => void;
  injectJavaScript: (script: string) => void;
  goBack: () => void;
  reload: () => void;
}

/**
 * WebView 명령 통로. 브리지 응답·뒤로 가기처럼 렌더 밖에서만 쓰고 렌더 결과에는 영향을 주지 않는다.
 * 라우터를 만들 때 넘겨도 렌더 중 ref를 읽는 것으로 오해받지 않게 ref 대신 쓴다.
 */
export function createWebViewChannel(): IWebViewChannel {
  let target: WebView | null = null;
  return {
    attach: (webView) => {
      target = webView;
    },
    injectJavaScript: (script) => {
      target?.injectJavaScript(script);
    },
    goBack: () => {
      target?.goBack();
    },
    reload: () => {
      target?.reload();
    },
  };
}
