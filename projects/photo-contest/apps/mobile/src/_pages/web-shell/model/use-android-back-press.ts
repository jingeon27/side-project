import { useEffect, useEffectEvent } from 'react';
import { BackHandler, Platform } from 'react-native';

import type { INativeRouter } from '@photo-contest/bridge/native';

import { resolveBackPress } from '@/features/navigation';

/** 웹이 바텀시트·모달을 닫는 데 충분하고, 사용자가 느끼기 전에 기본 동작으로 넘어가는 시간 */
const BACK_REQUEST_TIMEOUT_MS = 800;

interface IUseAndroidBackPressOptions {
  router: INativeRouter;
  isWebReady: () => boolean;
  canGoBack: () => boolean;
  goBack: () => void;
}

/**
 * Android 뒤로 가기를 웹에 먼저 묻는다(navigation.back). 웹이 처리하지 않으면 WebView 기록, 그것도 없으면 앱을 닫는다.
 * 답을 기다리는 동안 다시 누른 뒤로 가기는 무시해 두 단계를 한꺼번에 건너뛰지 않게 한다.
 */
export function useAndroidBackPress(options: IUseAndroidBackPressOptions) {
  const askWeb = useEffectEvent(() => {
    if (!options.isWebReady()) return Promise.resolve({ handled: false });
    return options.router.requestWeb('navigation.back', {}, { timeoutMs: BACK_REQUEST_TIMEOUT_MS });
  });
  const canGoBack = useEffectEvent(() => options.canGoBack());
  const goBack = useEffectEvent(() => options.goBack());

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const lifecycle = { pending: false, active: true };

    const handleHardwareBackPress = () => {
      if (lifecycle.pending) return true;
      lifecycle.pending = true;
      void resolveBackPress(
        () => askWeb(),
        () => canGoBack(),
      ).then((action) => {
        if (!lifecycle.active) return;
        lifecycle.pending = false;
        if (action === 'go-back') goBack();
        if (action === 'exit') BackHandler.exitApp();
      });
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', handleHardwareBackPress);
    return () => {
      lifecycle.active = false;
      subscription.remove();
    };
  }, []);
}
