'use client';

import { createContext, use, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

import { bindNavigationGuard, NavigationGuardRegistry } from './navigation-guard';

const NavigationGuardContext = createContext<NavigationGuardRegistry | null>(null);
/** openOverlay가 오버레이마다 채운다. 안에서 등록한 초안이 어느 오버레이 것인지 가드에 남긴다. */
export const NavigationOverlayContext = createContext<string | null>(null);

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const [registry] = useState(() => new NavigationGuardRegistry());
  const hasGuards = useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
    registry.getServerSnapshot,
  );
  useEffect(() => bindNavigationGuard({ registry }), [registry]);
  useEffect(() => {
    if (!hasGuards) return;
    const handleUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [hasGuards]);
  return <NavigationGuardContext value={registry}>{children}</NavigationGuardContext>;
}

export function useNavigationGuardRegistry() {
  const registry = use(NavigationGuardContext);
  if (!registry) throw new Error('NavigationGuardProvider가 필요합니다.');
  return registry;
}
