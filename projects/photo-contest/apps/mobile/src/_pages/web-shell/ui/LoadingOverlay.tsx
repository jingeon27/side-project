import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAppearance } from '@/shared/model/appearance';

interface ILoadingOverlayProps {
  visible: boolean;
}

/** 스플래시와 같은 배경으로 WebView 첫 렌더 전 흰 화면을 가린다. */
export function LoadingOverlay({ visible }: ILoadingOverlayProps) {
  const { colors } = useAppearance();
  if (!visible) return null;
  return (
    <View
      style={[styles.overlay, { backgroundColor: colors.background }]}
      accessibilityLabel="불러오는 중"
      accessibilityRole="progressbar"
      testID="loading-overlay"
    >
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
