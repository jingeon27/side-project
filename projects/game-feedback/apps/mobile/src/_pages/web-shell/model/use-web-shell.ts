import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { BackHandler, Linking, Platform } from 'react-native';
import type { WebViewProps } from 'react-native-webview';
import { buildBootstrapScript, buildDispatchScript } from '@game-feedback/bridge';
import { NativeHost, nativeLogin } from '@/features/bridge';
import { decideNavigation, isSameOrigin, toWebPath } from '@/features/navigation';
import { APP_VERSION, WEB_ORIGIN } from '@/shared/config/env';
import { isLoadFailure } from '../lib/load-error';
import { WebViewChannel } from './web-view-channel';
import { useShellLifecycle } from './use-shell-lifecycle';

export function useWebShell() {
  const [channel] = useState(() => new WebViewChannel(`${WEB_ORIGIN}/`));
  const { sourceUrl, webViewKey, loading, offline, overlayOpen } = useSyncExternalStore(
    channel.subscribe,
    channel.getSnapshot,
  );
  const [host] = useState(
    () =>
      new NativeHost({
        origin: WEB_ORIGIN,
        send: (message) => channel.inject(buildDispatchScript(message)),
        login: (provider) => nativeLogin(WEB_ORIGIN, provider),
        onLocation: (path) => {
          channel.rememberUrl(`${WEB_ORIGIN}${path}`);
        },
        onReady: channel.finishLoading,
        onOverlayChange: channel.setOverlayOpen,
        onRootBack: () => BackHandler.exitApp(),
      }),
  );
  useEffect(() => () => host.reset(), [host]);
  const handleOpenLink = useCallback(
    (url: string) => {
      const path = toWebPath(url, WEB_ORIGIN);
      if (!path) return;
      channel.rememberUrl(`${WEB_ORIGIN}${path}`);
      if (!host.open(path)) channel.loadCurrentDocument();
    },
    [channel, host],
  );
  const handleFallbackBack = useCallback(() => {
    if (channel.canGoBack()) {
      channel.goBack();
      return;
    }
    BackHandler.exitApp();
  }, [channel]);
  useShellLifecycle({
    openLink: handleOpenLink,
    onState: host.state,
    onBack: host.back,
    onFallbackBack: handleFallbackBack,
  });
  const handleRecreate = useCallback(() => {
    host.reset();
    channel.recreate();
  }, [channel, host]);
  const handleFailure = useCallback(() => {
    host.reset();
    channel.fail();
  }, [channel, host]);
  function navigate(url: string, newWindow = false) {
    const decision = decideNavigation(url, WEB_ORIGIN);
    if (decision.action === 'allow') {
      if (newWindow && isSameOrigin(url, WEB_ORIGIN)) {
        handleOpenLink(url);
      }
      return !newWindow;
    }
    if (decision.action === 'navigate') handleOpenLink(`${WEB_ORIGIN}${decision.path}`);
    if (decision.action === 'external') void Linking.openURL(decision.url).catch(() => undefined);
    return false;
  }
  const webViewProps = {
    allowsInlineMediaPlayback: true,
    mediaPlaybackRequiresUserAction: true,
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
    allowsBackForwardNavigationGestures: !overlayOpen,
    pullToRefreshEnabled: true,
    onShouldStartLoadWithRequest: (request) => navigate(request.url),
    onOpenWindow: (event) => {
      navigate(event.nativeEvent.targetUrl, true);
    },
    onMessage: (event) => host.receive(event.nativeEvent.data, event.nativeEvent.url),
    onNavigationStateChange: (state) => {
      channel.rememberHistory(state.canGoBack);
      const path =
        state.url === WEB_ORIGIN || state.url === `${WEB_ORIGIN}/` ? null : toWebPath(state.url, WEB_ORIGIN);
      if (path) channel.rememberUrl(`${WEB_ORIGIN}${path}`);
    },
    onLoadStart: (event) => {
      if (Platform.OS === 'ios' && channel.startsDocument(event.nativeEvent.url)) host.reset();
    },
    onLoadEnd: channel.finishLoading,
    onError: (event) => {
      event.preventDefault();
      if (isSameOrigin(event.nativeEvent.url, WEB_ORIGIN) && isLoadFailure(event.nativeEvent))
        handleFailure();
    },
    onHttpError: (event) => {
      if (isSameOrigin(event.nativeEvent.url, WEB_ORIGIN) && event.nativeEvent.statusCode >= 500)
        handleFailure();
    },
    onRenderProcessGone: handleRecreate,
    onContentProcessDidTerminate: () => {
      host.reset();
      channel.reload();
    },
  } satisfies WebViewProps;
  return {
    attachWebView: channel.attach,
    webViewProps,
    webViewKey,
    loading,
    offline,
    handleRetry: handleRecreate,
  };
}
