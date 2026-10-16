import { useEffect, useMemo, useState } from 'react';
import { BackHandler, Linking, Platform } from 'react-native';
import type { WebViewProps } from 'react-native-webview';
import { buildBootstrapScript, buildDispatchScript } from '@game-feedback/bridge';
import { createNativeHost, nativeLogin } from '@/features/bridge';
import { decideNavigation, isSameOrigin, toWebPath } from '@/features/navigation';
import { APP_VERSION, WEB_ORIGIN } from '@/shared/config/env';
import { isLoadFailure } from '../lib/load-error';
import { createWebViewChannel } from './web-view-channel';
import { useShellLifecycle } from './use-shell-lifecycle';

export function useWebShell() {
  const [channel] = useState(() => createWebViewChannel(`${WEB_ORIGIN}/ko`));
  const [sourceUrl, setSourceUrl] = useState(`${WEB_ORIGIN}/ko`);
  const [webViewKey, setWebViewKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [host] = useState(() =>
    createNativeHost({
      origin: WEB_ORIGIN,
      send: (message) => channel.inject(buildDispatchScript(message)),
      login: () => nativeLogin(WEB_ORIGIN),
      onLocation: (path) => {
        channel.rememberUrl(`${WEB_ORIGIN}${path}`);
      },
      onReady: () => setLoading(false),
    }),
  );
  useEffect(() => () => host.reset(), [host]);
  const lifecycle = useMemo(
    () => ({
      openLink(url: string) {
        const path = toWebPath(url, WEB_ORIGIN);
        if (!path) return;
        channel.rememberUrl(`${WEB_ORIGIN}${path}`);
        if (!host.open(path)) setSourceUrl(channel.currentUrl());
      },
      onState: host.state,
      onBack: host.back,
      onFallbackBack() {
        if (channel.canGoBack()) {
          channel.goBack();
          return;
        }
        BackHandler.exitApp();
      },
    }),
    [channel, host],
  );
  useShellLifecycle(lifecycle);
  function recreate() {
    host.reset();
    setOffline(false);
    setLoading(true);
    setSourceUrl(channel.currentUrl());
    setWebViewKey((value) => value + 1);
  }
  function fail() {
    host.reset();
    setLoading(false);
    setOffline(true);
  }
  function navigate(url: string, newWindow = false) {
    const decision = decideNavigation(url, WEB_ORIGIN);
    if (decision.action === 'allow') {
      if (newWindow && isSameOrigin(url, WEB_ORIGIN)) {
        channel.rememberUrl(url);
        setSourceUrl(url);
      }
      return !newWindow;
    }
    if (decision.action === 'navigate') lifecycle.openLink(`${WEB_ORIGIN}${decision.path}`);
    if (decision.action === 'external') void Linking.openURL(decision.url).catch(() => undefined);
    return false;
  }
  const webViewProps: WebViewProps = {
    source: { uri: sourceUrl },
    originWhitelist: ['*'],
    setSupportMultipleWindows: false,
    sharedCookiesEnabled: true,
    thirdPartyCookiesEnabled: true,
    applicationNameForUserAgent: `GameFeedbackApp/${APP_VERSION}`,
    injectedJavaScriptBeforeContentLoaded: buildBootstrapScript(APP_VERSION),
    injectedJavaScript: buildBootstrapScript(APP_VERSION),
    contentInsetAdjustmentBehavior: 'never',
    webviewDebuggingEnabled: __DEV__,
    allowsBackForwardNavigationGestures: true,
    pullToRefreshEnabled: true,
    onShouldStartLoadWithRequest: (request) => navigate(request.url),
    onOpenWindow: (event) => {
      navigate(event.nativeEvent.targetUrl, true);
    },
    onMessage: (event) => host.receive(event.nativeEvent.data, event.nativeEvent.url),
    onNavigationStateChange: (state) => {
      channel.rememberHistory(state.canGoBack);
      if (isSameOrigin(state.url, WEB_ORIGIN)) channel.rememberUrl(state.url);
    },
    onLoadStart: (event) => {
      if (Platform.OS === 'ios' && channel.startsDocument(event.nativeEvent.url)) host.reset();
    },
    onLoadEnd: () => setLoading(false),
    onError: (event) => {
      event.preventDefault();
      if (isSameOrigin(event.nativeEvent.url, WEB_ORIGIN) && isLoadFailure(event.nativeEvent)) fail();
    },
    onHttpError: (event) => {
      if (isSameOrigin(event.nativeEvent.url, WEB_ORIGIN) && event.nativeEvent.statusCode >= 500) fail();
    },
    onRenderProcessGone: recreate,
    onContentProcessDidTerminate: () => {
      host.reset();
      channel.reload();
    },
  };
  return { attachWebView: channel.attach, webViewProps, webViewKey, loading, offline, handleRetry: recreate };
}
