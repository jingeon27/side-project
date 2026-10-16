import { useEffect } from 'react';
import { AppState, BackHandler, Platform } from 'react-native';
import * as Linking from 'expo-linking';

interface ILifecycleOptions {
  openLink: (url: string) => void;
  onState: (state: 'active' | 'background') => void;
  onBack: () => Promise<boolean>;
  onFallbackBack: () => void;
}
export function useShellLifecycle(options: ILifecycleOptions) {
  useEffect(() => {
    let mounted = true;
    let background = false;
    let pending = false;
    void Linking.getInitialURL().then((url) => {
      if (mounted && url) options.openLink(url);
    });
    const link = Linking.addEventListener('url', ({ url }) => options.openLink(url));
    const state = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        background = true;
        options.onState('background');
      }
      if (next === 'active' && background) {
        background = false;
        options.onState('active');
      }
    });
    const back =
      Platform.OS === 'android'
        ? BackHandler.addEventListener('hardwareBackPress', () => {
            if (pending) return true;
            pending = true;
            void options
              .onBack()
              .then((handled) => {
                if (mounted && !handled) options.onFallbackBack();
              })
              .finally(() => {
                pending = false;
              });
            return true;
          })
        : null;
    return () => {
      mounted = false;
      link.remove();
      state.remove();
      back?.remove();
    };
  }, [options]);
}
