import { StyleSheet } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';

import { COLORS } from '@/shared/config/theme';

import { useWebShell } from '../model/use-web-shell';
import { LaunchScreen } from './LaunchScreen';
import { OfflineView } from './OfflineView';

export function WebShellPage() {
  const { attachWebView, webViewKey, webViewProps, loading, offline, handleRetry } = useWebShell();
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <WebView key={webViewKey} ref={attachWebView} style={styles.root} {...webViewProps} />
      {loading && <LaunchScreen />}
      {offline && <OfflineView onRetry={handleRetry} />}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
});
