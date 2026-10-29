import { useSyncExternalStore } from 'react';

import { NATIVE_BOOTSTRAP_EVENT, supportsNativePush } from '@/shared/native';

const subscribe = (listener: () => void) => {
  window.addEventListener(NATIVE_BOOTSTRAP_EVENT, listener);
  return () => window.removeEventListener(NATIVE_BOOTSTRAP_EVENT, listener);
};

export function useNativePushSupported() {
  return useSyncExternalStore(subscribe, supportsNativePush, () => false);
}
