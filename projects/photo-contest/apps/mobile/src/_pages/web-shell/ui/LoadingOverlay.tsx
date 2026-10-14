import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { COLORS } from '@/shared/config/theme';

interface ILoadingOverlayProps {
  visible: boolean;
}

/** 스플래시와 같은 배경으로 WebView 첫 렌더 전 흰 화면을 가린다. */
export function LoadingOverlay({ visible }: ILoadingOverlayProps) {
  if (!visible) return null;
  return (
    <View
      style={styles.overlay}
      accessibilityLabel="불러오는 중"
      accessibilityRole="progressbar"
      testID="loading-overlay"
    >
      <ActivityIndicator size="large" color={COLORS.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
});
