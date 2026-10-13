import { useLayoutEffect, useRef } from 'react';

/** 네이티브 이벤트 구독을 다시 만들지 않고도 최신 콜백을 부르기 위해 쓴다. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
