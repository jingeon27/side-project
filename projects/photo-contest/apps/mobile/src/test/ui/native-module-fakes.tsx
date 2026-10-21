import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

/** react-native-safe-area-context 대역. 안전 영역 여백 없이 View로 그린다. */
export function FakeSafeAreaView({ edges: _edges, ...props }: ViewProps & { edges?: unknown }) {
  return <View {...props} />;
}

export function FakeSafeAreaProvider({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

/** expo-status-bar 대역 */
export function FakeStatusBar() {
  return null;
}
