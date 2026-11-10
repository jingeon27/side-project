import { useCallback, useEffect, useEffectEvent, useRef } from 'react';

import { isTopOverlayEntry, pushOverlayEntry, releaseOverlayEntry } from './overlay-history.store';

/**
 * 열려 있는 동안 history 항목을 하나 차지한다. 뒤로 가기를 누르면 onClose를 부른다.
 * 돌려준 함수는 이 오버레이 위에 다른 오버레이가 열려 있지 않은지 알려 준다.
 */
export function useOverlayHistory(isOpen: boolean, onClose: () => void) {
  const handleClose = useEffectEvent(onClose);
  const entryKey = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const lifetime = new AbortController();
    // StrictMode가 effect를 두 번 실행할 때 항목을 두 번 쌓고 back()이 엇갈리지 않게 한 틱 미룬다.
    const timer = window.setTimeout(() => {
      const key = pushOverlayEntry(handleClose);
      entryKey.current = key;
      lifetime.signal.addEventListener(
        'abort',
        () => {
          releaseOverlayEntry(key);
          if (entryKey.current === key) entryKey.current = null;
        },
        { once: true },
      );
    }, 0);
    return () => {
      window.clearTimeout(timer);
      lifetime.abort();
    };
  }, [isOpen]);

  // 아직 항목을 쌓기 전이거나 history를 맡지 않은 오버레이는 맨 위로 본다.
  return useCallback(() => entryKey.current === null || isTopOverlayEntry(entryKey.current), []);
}
