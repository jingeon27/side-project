import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '@/shared/config/theme';

interface IServiceErrorBoundaryProps {
  children: ReactNode;
}
interface IServiceErrorBoundaryState {
  failed: boolean;
}

// React Native exposes render error boundaries through the class lifecycle.
export class ServiceErrorBoundary extends Component<IServiceErrorBoundaryProps, IServiceErrorBoundaryState> {
  state: IServiceErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): IServiceErrorBoundaryState {
    return { failed: true };
  }

  handleRetry = () => {
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.content} accessibilityRole="alert">
          <Text style={styles.title} accessibilityRole="header">
            서비스 화면을 열지 못했어요
          </Text>
          <Text style={styles.description}>잠시 후 다시 시도해 주세요.</Text>
          <Pressable accessibilityRole="button" onPress={this.handleRetry} style={styles.button}>
            <Text style={styles.label}>서비스 다시 열기</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  title: { color: COLORS.ink, fontSize: 22, fontWeight: '700' },
  description: { color: COLORS.muted, fontSize: 16 },
  button: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: COLORS.ink,
    borderRadius: 8,
  },
  label: { color: COLORS.onBrand, fontSize: 16, fontWeight: '600' },
});
