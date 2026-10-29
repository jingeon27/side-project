import { useLayoutEffect, useRef } from 'react';

/** WebView prop·렌더 중 만든 채널처럼 Effect 밖에서도 호출되는 콜백에 최신 값을 전달한다. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
