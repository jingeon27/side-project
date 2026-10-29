import { useEffect, useEffectEvent } from 'react';
import { AppState, BackHandler, Platform } from 'react-native';

import * as Linking from 'expo-linking';

import { ShellLifecycle, type IShellLifecycleOptions } from './shell-lifecycle';

export function useShellLifecycle({ openLink, onState, onBack, onFallbackBack }: IShellLifecycleOptions) {
  const handleOpenLink = useEffectEvent(openLink);
  const handleState = useEffectEvent(onState);
  const handleBack = useEffectEvent(onBack);
  const handleFallbackBack = useEffectEvent(onFallbackBack);

  useEffect(() => {
    const lifecycle = new ShellLifecycle({
      openLink: handleOpenLink,
      onState: handleState,
      onBack: handleBack,
      onFallbackBack: handleFallbackBack,
    });
    const openInitialLink = async () => {
      try {
        lifecycle.openInitialLink(await Linking.getInitialURL());
      } catch {
        // OS 링크 조회 실패는 후속 url 구독을 막지 않는다.
      }
    };
    void openInitialLink();
    const link = Linking.addEventListener('url', lifecycle.openLink);
    const state = AppState.addEventListener('change', lifecycle.changeState);
    const back =
      Platform.OS === 'android' ? BackHandler.addEventListener('hardwareBackPress', lifecycle.back) : null;
    return () => {
      lifecycle.dispose();
      link.remove();
      state.remove();
      back?.remove();
    };
  }, []);
}
