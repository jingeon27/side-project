import { COLORS } from '@/shared/config/theme';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import { useWebShell } from '../model/use-web-shell';
import { OfflineView } from './OfflineView';
export function WebShellPage() {
  const { attachWebView, webViewKey, webViewProps, loading, offline, handleRetry } = useWebShell();
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <WebView key={webViewKey} ref={attachWebView} style={styles.root} {...webViewProps} />
      {loading && (
        <View accessibilityLabel="페이지 불러오는 중" style={styles.loading}>
          <ActivityIndicator color={COLORS.ink} size="large" />
        </View>
      )}
      {offline && <OfflineView onRetry={handleRetry} />}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  loading: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
});
