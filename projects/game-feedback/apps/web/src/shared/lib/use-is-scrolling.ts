'use client';

import { useEffect, useState } from 'react';

import { debounce } from 'es-toolkit';

export function useIsScrolling() {
  const [scrolling, setScrolling] = useState(false);

  useEffect(() => {
    const restoreIdle = debounce(() => setScrolling(false), 180);
    const handleScroll = () => {
      setScrolling(true);
      restoreIdle();
    };
    // Activity가 보관한 화면도 다시 연결된 뒤 정지 상태로 돌아간다.
    restoreIdle();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      restoreIdle.cancel();
    };
  }, []);

  return scrolling;
}
