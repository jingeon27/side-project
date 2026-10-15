'use client';

import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

const subscribe = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/** RSC에서 사전 조회할 수 없는 조건부 쿼리는 브라우저의 Apollo 링크가 준비된 뒤 시작한다. */
export function ClientOnly({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const hydrated = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  return hydrated ? children : fallback;
}
