import { StyleSheet } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';

import { COLORS } from '@/shared/config/theme';

import { useWebShell } from '../model/use-web-shell';
import { LoadingOverlay } from '../ui/LoadingOverlay';
import { OfflineView } from '../ui/OfflineView';

/** 모든 URL을 navigation-policy가 판단하게 한다. 기본값은 http(s)가 아닌 링크를 판단 없이 밖에서 연다. */
const ORIGIN_WHITELIST = ['*'];

interface IWebShellPageTemplateProps {
  initialPath: string;
  appVersion: string;
  /** 웹 분석 SDK와 함께 쓸 네이티브 기기 ID. 분석을 켜지 않았으면 null */
  analyticsDeviceId: string | null;
  onReady: () => void;
}

/**
 * 웹 전체를 WebView 하나로 보여 준다. 안전 영역은 네이티브가 맡아 웹의 env(safe-area-inset-*)는 0이 된다.
 * 세션은 WebView 쿠키가 맡고, 화면 이동 기록은 웹이 가진다.
 */
export function WebShellPageTemplate({
  initialPath,
  appVersion,
  analyticsDeviceId,
  onReady,
}: IWebShellPageTemplateProps) {
  const { attachWebView, webViewKey, sourceUrl, isLoading, hasLoadError, handleRetry, webViewProps } =
    useWebShell({ initialPath, appVersion, analyticsDeviceId, onReady });

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
      {hasLoadError ? (
        <OfflineView onRetry={handleRetry} />
      ) : (
        <WebView
          key={webViewKey}
          ref={attachWebView}
          source={{ uri: sourceUrl }}
          originWhitelist={ORIGIN_WHITELIST}
          setSupportMultipleWindows={false}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          allowsBackForwardNavigationGestures
          pullToRefreshEnabled
          webviewDebuggingEnabled={__DEV__}
          contentInsetAdjustmentBehavior="never"
          style={styles.webView}
          containerStyle={styles.webView}
          {...webViewProps}
        />
      )}
      <LoadingOverlay visible={isLoading && !hasLoadError} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  webView: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
