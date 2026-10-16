import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebShellPage } from '@/_pages/web-shell';
import { ServiceErrorBoundary } from '@/shared/ui';
export function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <ServiceErrorBoundary>
        <WebShellPage />
      </ServiceErrorBoundary>
    </SafeAreaProvider>
  );
}
