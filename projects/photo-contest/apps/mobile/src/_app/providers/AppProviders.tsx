import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAppearance } from '@/shared/model/appearance';

import { AppErrorBoundary } from './AppErrorBoundary';

interface IAppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: IAppProvidersProps) {
  const { colors } = useAppearance();
  return (
    <SafeAreaProvider style={[styles.root, { backgroundColor: colors.background }]}>
      <AppErrorBoundary>{children}</AppErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
