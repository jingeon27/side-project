import { useSyncExternalStore } from 'react';
import { isNativeApp, NATIVE_BOOTSTRAP_EVENT } from '@/shared/native';

const query = '(hover: hover) and (pointer: fine)';
function subscribe(listener: () => void) {
  const media = window.matchMedia?.(query);
  media?.addEventListener('change', listener);
  window.addEventListener(NATIVE_BOOTSTRAP_EVENT, listener);
  return () => {
    media?.removeEventListener('change', listener);
    window.removeEventListener(NATIVE_BOOTSTRAP_EVENT, listener);
  };
}
function snapshot() {
  return !isNativeApp() && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}
export function useDesktopKeyboard() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
