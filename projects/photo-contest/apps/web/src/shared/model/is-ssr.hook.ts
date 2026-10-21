import { noop } from 'es-toolkit';
import { useSyncExternalStore } from 'react';

/** 바뀌지 않는 브라우저 값을 useSyncExternalStore로 읽을 때 쓴다. 렌더마다 새로 구독하지 않게 모듈 상수로 둔다. */
export const subscribeNothing = () => noop;

/**
 * 서버 렌더링과 첫 hydration 동안 true. 브라우저에서도 hydration 중에는 서버 HTML과 맞추려고 true를 돌려준다.
 * 사전 조회하지 못한 쿼리는 이 값으로 skipToken을 넘겨 브라우저에서만 시작한다.
 */
export function useIsSSR() {
  return useSyncExternalStore(
    subscribeNothing,
    () => false,
    () => true,
  );
}
