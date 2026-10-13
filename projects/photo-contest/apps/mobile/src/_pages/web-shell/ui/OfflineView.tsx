import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/shared/config/theme';

interface IOfflineViewProps {
  onRetry: () => void;
}

/** 웹 문서를 불러오지 못했을 때. WebView 기본 오류 화면 대신 보여 준다. */
export function OfflineView({ onRetry }: IOfflineViewProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        연결할 수 없어요
      </Text>
      <Text style={styles.description}>인터넷 연결을 확인한 뒤 다시 시도해 주세요.</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonLabel}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: COLORS.background,
  },
  title: {
    marginBottom: 8,
    color: COLORS.ink,
    fontSize: 20,
    fontWeight: '700',
  },
  description: {
    marginBottom: 24,
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  button: {
    minWidth: 160,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: COLORS.brand,
  },
  buttonPressed: {
    backgroundColor: COLORS.brandPressed,
  },
  buttonLabel: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '600',
  },
});
