import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { COLORS } from '@/shared/config/theme';

import { AppErrorBoundary } from './AppErrorBoundary';

interface IAppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: IAppProvidersProps) {
  return (
    <SafeAreaProvider style={styles.root}>
      <AppErrorBoundary>{children}</AppErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
