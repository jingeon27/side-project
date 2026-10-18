import { useEffect } from 'react';
import { AppState, BackHandler, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { ShellLifecycle, type IShellLifecycleOptions } from './shell-lifecycle';

export function useShellLifecycle({ openLink, onState, onBack, onFallbackBack }: IShellLifecycleOptions) {
  useEffect(() => {
    const lifecycle = new ShellLifecycle({ openLink, onState, onBack, onFallbackBack });
    void Linking.getInitialURL()
      .then(lifecycle.openInitialLink)
      .catch(() => undefined);
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
  }, [openLink, onState, onBack, onFallbackBack]);
}
