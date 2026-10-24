import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from '@/shared/config/theme';
import { captureError } from '@/shared/lib/monitoring/monitoring';

import { hideSplashScreen } from '../model/use-splash-screen';

interface IAppErrorFallbackProps {
  onRestart: () => void;
}

function AppErrorFallback({ onRestart }: IAppErrorFallbackProps) {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          문제가 생겼어요
        </Text>
        <Text style={styles.description}>잠시 후 다시 시작해 주세요.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onRestart}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonLabel}>다시 시작</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

interface IAppErrorBoundaryProps {
  children: ReactNode;
}

interface IAppErrorBoundaryState {
  hasError: boolean;
}

/** 네이티브 셸 코드의 렌더 오류로 빈 화면에 갇히지 않게 한다. React는 오류 경계를 클래스로만 제공한다. */
export class AppErrorBoundary extends Component<IAppErrorBoundaryProps, IAppErrorBoundaryState> {
  state: IAppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): IAppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 스플래시가 닫히기 전에 실패하면 안내 화면이 가려진다.
    hideSplashScreen();
    captureError(error, info.componentStack);
  }

  handleRestart = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) return <AppErrorFallback onRestart={this.handleRestart} />;
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
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
