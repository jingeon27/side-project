import { PROTOCOL_VERSION, buildAppUserAgent, originOf } from '@photo-contest/bridge';
import { buildBootstrapScript } from '@photo-contest/bridge/native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { WebViewProps } from 'react-native-webview';

import { createNativeCapabilities } from '@/features/bridge/model/native-capabilities';
import { isRelativeWebPath } from '@/features/navigation/lib/deep-link';
import { decideNavigation, decideOpenWindow } from '@/features/navigation/lib/navigation-policy';
import { LINK_OPTIONS, toWebUrl } from '@/features/navigation/model/link-options';
import { openExternalUrl } from '@/features/navigation/model/open-external';
import { useDeepLinkEvents } from '@/features/navigation/model/use-deep-link-events';
import { WEB_ORIGIN } from '@/shared/config/env';
import { useLatest } from '@/shared/lib/use-latest';

import { startsNewDocument } from '../lib/document-load';
import { isOfflineHttpError, isOfflineLoadError } from '../lib/load-error';
import { useAndroidBackPress } from './use-android-back-press';
import { useAppStateEvents } from './use-app-state-events';
import { useWebShellBridge } from './use-web-shell-bridge';
import { createWebViewChannel } from './web-view-channel';

type TWebViewHandler<TName extends keyof WebViewProps> = NonNullable<WebViewProps[TName]>;

interface IUseWebShellOptions {
  /** 처음 열 웹 경로 (`/`, `/invite/abc` 등) */
  initialPath: string;
  appVersion: string;
  /** 첫 화면이 그려졌거나 그릴 수 없을 때. 스플래시를 닫는다. 여러 번 불릴 수 있다. */
  onReady: () => void;
}

function isWebOriginUrl(url: string) {
  return originOf(url) === originOf(WEB_ORIGIN);
}

/** 웹 셸 화면의 상태와 WebView 이벤트 처리. 화면은 이 결과를 그대로 WebView에 넘긴다. */
export function useWebShell({ initialPath, appVersion, onReady }: IUseWebShellOptions) {
  const [channel] = useState(createWebViewChannel);
  const [capabilities] = useState(createNativeCapabilities);
  const [sourceUrl, setSourceUrl] = useState(() => toWebUrl(initialPath));
  /** 바꾸면 WebView를 새로 만든다. Android 렌더러가 죽으면 기존 WebView는 다시 쓸 수 없다. */
  const [webViewKey, setWebViewKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const isWebReadyRef = useRef(false);
  const canGoBackRef = useRef(false);
  /** 다시 만들 때 열 주소. 사용자가 보던 웹 화면에 머물게 한다. */
  const currentUrlRef = useRef(sourceUrl);
  const onReadyRef = useLatest(onReady);

  const finishLoading = useCallback(() => {
    setIsLoading(false);
    onReadyRef.current();
  }, [onReadyRef]);

  const showOffline = useCallback(() => {
    isWebReadyRef.current = false;
    setHasLoadError(true);
    finishLoading();
  }, [finishLoading]);

  const router = useWebShellBridge({
    channel,
    capabilities,
    handlers: {
      onAppReady: ({ path }) => {
        isWebReadyRef.current = true;
        if (isRelativeWebPath(path)) currentUrlRef.current = toWebUrl(path);
        finishLoading();
      },
      onNavigationChanged: ({ path }) => {
        if (isRelativeWebPath(path)) currentUrlRef.current = toWebUrl(path);
      },
      // 세션은 WebView 쿠키가 맡아 앱이 따로 들고 있을 상태가 없다.
      onAuthChanged: () => undefined,
    },
  });

  /** 웹이 준비됐으면 웹 라우터로 이동하고, 아니면 그 경로로 문서를 새로 연다. */
  const openPath = useCallback(
    (path: string) => {
      if (isWebReadyRef.current) {
        router.emit('navigation.open', { path });
        return;
      }
      const url = toWebUrl(path);
      currentUrlRef.current = url;
      setSourceUrl(url);
      setHasLoadError(false);
      setIsLoading(true);
    },
    [router],
  );

  const recreateWebView = useCallback(() => {
    isWebReadyRef.current = false;
    canGoBackRef.current = false;
    setSourceUrl(currentUrlRef.current);
    setHasLoadError(false);
    setIsLoading(true);
    setWebViewKey((key) => key + 1);
  }, []);

  useDeepLinkEvents(openPath);
  useAppStateEvents({ router, isWebReady: () => isWebReadyRef.current });
  useAndroidBackPress({
    router,
    isWebReady: () => isWebReadyRef.current,
    canGoBack: () => canGoBackRef.current,
    goBack: channel.goBack,
  });

  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const bootstrapScript = useMemo(
    () =>
      buildBootstrapScript({
        platform,
        appVersion,
        protocolVersion: PROTOCOL_VERSION,
        capabilities: Object.keys(capabilities),
      }),
    [appVersion, capabilities, platform],
  );

  const handleShouldStartLoadWithRequest = useCallback<TWebViewHandler<'onShouldStartLoadWithRequest'>>(
    ({ url, isTopFrame }) => {
      const decision = decideNavigation({ url, isTopFrame }, LINK_OPTIONS);
      if (decision.action === 'allow') return true;
      if (decision.action === 'open-in-web') openPath(decision.path);
      else if (decision.action === 'open-external') void openExternalUrl(decision.url, decision.fallbackUrl);
      return false;
    },
    [openPath],
  );

  const handleOpenWindow = useCallback<TWebViewHandler<'onOpenWindow'>>(
    ({ nativeEvent }) => {
      const decision = decideOpenWindow(nativeEvent.targetUrl, LINK_OPTIONS);
      if (decision.action === 'open-in-web') openPath(decision.path);
      else if (decision.action === 'open-external') void openExternalUrl(decision.url, decision.fallbackUrl);
    },
    [openPath],
  );

  const handleMessage = useCallback<TWebViewHandler<'onMessage'>>(
    ({ nativeEvent }) => {
      void router.handleMessage(nativeEvent.data, nativeEvent.url);
    },
    [router],
  );

  const handleLoadStart = useCallback<TWebViewHandler<'onLoadStart'>>(
    ({ nativeEvent }) => {
      // 새 문서를 열면 이전 문서의 웹 브리지는 사라진다. 새 문서가 app.ready를 다시 알릴 때까지 기다린다.
      const previousUrl = currentUrlRef.current;
      if (
        startsNewDocument({
          platform,
          url: nativeEvent.url,
          navigationType: nativeEvent.navigationType,
          previousUrl,
        })
      )
        isWebReadyRef.current = false;
      if (isWebOriginUrl(nativeEvent.url)) currentUrlRef.current = nativeEvent.url;
    },
    [platform],
  );

  const handleNavigationStateChange = useCallback<TWebViewHandler<'onNavigationStateChange'>>((state) => {
    canGoBackRef.current = state.canGoBack;
    if (isWebOriginUrl(state.url)) currentUrlRef.current = state.url;
  }, []);

  const handleLoadEnd = useCallback<TWebViewHandler<'onLoadEnd'>>(() => finishLoading(), [finishLoading]);

  const handleError = useCallback<TWebViewHandler<'onError'>>(
    (event) => {
      // WebView 기본 오류 화면(영문)을 띄우지 않는다. 연결 문제일 때만 오프라인 화면으로 바꾼다.
      event.preventDefault();
      if (isOfflineLoadError(event.nativeEvent, WEB_ORIGIN)) showOffline();
    },
    [showOffline],
  );

  const handleHttpError = useCallback<TWebViewHandler<'onHttpError'>>(
    ({ nativeEvent }) => {
      if (isOfflineHttpError(nativeEvent, WEB_ORIGIN)) showOffline();
    },
    [showOffline],
  );

  const handleContentProcessDidTerminate = useCallback<
    TWebViewHandler<'onContentProcessDidTerminate'>
  >(() => {
    // iOS는 웹 콘텐츠 프로세스가 끝나면 빈 화면이 된다. 같은 WebView에서 다시 불러오면 된다.
    isWebReadyRef.current = false;
    channel.reload();
  }, [channel]);

  const handleRenderProcessGone = useCallback<TWebViewHandler<'onRenderProcessGone'>>(
    () => recreateWebView(),
    [recreateWebView],
  );

  return {
    attachWebView: channel.attach,
    webViewKey,
    sourceUrl,
    isLoading,
    hasLoadError,
    handleRetry: recreateWebView,
    webViewProps: {
      applicationNameForUserAgent: buildAppUserAgent(appVersion),
      injectedJavaScriptBeforeContentLoaded: bootstrapScript,
      onShouldStartLoadWithRequest: handleShouldStartLoadWithRequest,
      onOpenWindow: handleOpenWindow,
      onMessage: handleMessage,
      onLoadStart: handleLoadStart,
      onLoadEnd: handleLoadEnd,
      onNavigationStateChange: handleNavigationStateChange,
      onError: handleError,
      onHttpError: handleHttpError,
      onContentProcessDidTerminate: handleContentProcessDidTerminate,
      onRenderProcessGone: handleRenderProcessGone,
    } satisfies Partial<WebViewProps>,
  };
}
