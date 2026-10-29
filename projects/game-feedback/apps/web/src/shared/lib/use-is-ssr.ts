import { useSyncExternalStore } from 'react';

import { noop } from 'es-toolkit';

// 렌더마다 새로 구독하지 않게 모듈 상수로 둔다.
const subscribeNothing = () => noop;

/** 서버 렌더링과 첫 hydration 동안 true. 브라우저에서도 hydration 중에는 서버 HTML과 맞추려고 true를 돌려준다. */
export function useIsSSR() {
  return useSyncExternalStore(
    subscribeNothing,
    () => false,
    () => true,
  );
}
