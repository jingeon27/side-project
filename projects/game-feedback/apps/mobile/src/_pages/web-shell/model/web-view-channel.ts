import type WebView from 'react-native-webview';
export function createWebViewChannel(initialUrl: string) {
  let view: WebView | null = null;
  let currentUrl = initialUrl;
  let canGoBack = false;
  let lastDocumentUrl = initialUrl;
  return {
    startsDocument(url: string) {
      const hashOnly = url !== lastDocumentUrl && url.split('#')[0] === lastDocumentUrl.split('#')[0];
      lastDocumentUrl = url;
      return !hashOnly;
    },
    attach(instance: WebView | null) {
      view = instance;
    },
    inject(script: string) {
      view?.injectJavaScript(script);
    },
    goBack() {
      view?.goBack();
    },
    reload() {
      view?.reload();
    },
    currentUrl() {
      return currentUrl;
    },
    rememberUrl(url: string) {
      currentUrl = url;
    },
    rememberHistory(value: boolean) {
      canGoBack = value;
    },
    canGoBack() {
      return canGoBack;
    },
  };
}
