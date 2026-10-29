import { useEffect, useEffectEvent } from 'react';

import { pushOverlayEntry, releaseOverlayEntry } from './overlay-history.store';

/** 열려 있는 동안 history 항목을 하나 차지한다. 뒤로 가기를 누르면 onClose를 부른다. */
export function useOverlayHistory(isOpen: boolean, onClose: () => void) {
  const close = useEffectEvent(onClose);

  useEffect(() => {
    if (!isOpen) return;
    const lifetime = new AbortController();
    // StrictMode가 effect를 두 번 실행할 때 항목을 두 번 쌓고 back()이 엇갈리지 않게 한 틱 미룬다.
    const timer = window.setTimeout(() => {
      const key = pushOverlayEntry(close);
      lifetime.signal.addEventListener('abort', () => releaseOverlayEntry(key), { once: true });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      lifetime.abort();
    };
  }, [isOpen]);
}
