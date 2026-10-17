import { useSyncExternalStore } from 'react';

const query = '(min-width: 761px) and (hover: hover) and (pointer: fine)';
function subscribe(listener: () => void) {
  if (!window.matchMedia) return () => {};
  const media = window.matchMedia(query);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
function snapshot() {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}
export function useDesktopKeyboard() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
