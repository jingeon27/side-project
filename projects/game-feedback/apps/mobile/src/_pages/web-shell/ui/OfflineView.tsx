import { COLORS } from '@/shared/config/theme';
import { Pressable, StyleSheet, Text, View } from 'react-native';
export function OfflineView({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.root}>
      <Text accessibilityRole="header" style={styles.title}>
        연결을 확인해 주세요
      </Text>
      <Text style={styles.description}>인터넷에 연결한 뒤 다시 시도해 주세요.</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="다시 시도"
        onPress={onRetry}
        style={styles.button}
      >
        <Text style={styles.label}>다시 시도</Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 24,
  },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.ink },
  description: { fontSize: 16, color: COLORS.muted },
  button: {
    minHeight: 44,
    paddingHorizontal: 24,
    justifyContent: 'center',
    backgroundColor: COLORS.ink,
    borderRadius: 8,
  },
  label: { color: COLORS.background, fontSize: 16, fontWeight: '600' },
});
