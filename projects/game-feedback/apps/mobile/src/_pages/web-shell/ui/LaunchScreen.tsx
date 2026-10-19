import { ActivityIndicator, StyleSheet, Text, useColorScheme, View } from 'react-native';

export function LaunchScreen() {
  const dark = useColorScheme() === 'dark';
  const foreground = dark ? '#f5f5f5' : '#101010';
  return (
    <View
      accessibilityLabel="페이지 불러오는 중"
      accessibilityRole="progressbar"
      style={[styles.screen, { backgroundColor: dark ? '#101010' : '#ffffff' }]}
    >
      <Text style={[styles.title, { color: foreground }]}>플레이메이트</Text>
      <ActivityIndicator color={foreground} size="small" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  title: { fontSize: 24, fontWeight: '700' },
});
