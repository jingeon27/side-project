'use client';

import { useEffect } from 'react';

/** 첫 hydration commit 뒤 `<html data-hydrated>`를 남긴다. 그 전의 입력은 라우터 초기화와 겹쳐 사라질 수 있어 e2e가 기다린다. */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true';
  }, []);
  return null;
}
