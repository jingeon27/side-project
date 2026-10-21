'use client';

import type { ReactNode } from 'react';

import { useIsSSR } from '../../../model/is-ssr.hook';

/**
 * 조회가 여러 하위 컴포넌트에 퍼져 있어 skipToken을 넘기기 어려운 트리를 브라우저에서만 그린다.
 * 조회를 직접 소유한 섹션은 useIsSSR + skipToken으로 시작을 미루고, 시작 전에는 경계와 같은 fallback을 그린다.
 */
export function ClientOnly({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  return useIsSSR() ? fallback : children;
}
