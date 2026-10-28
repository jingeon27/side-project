'use client';

import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { bindNavigationGuard, NavigationGuardRegistry } from './navigation-guard';

const NavigationGuardContext = createContext<NavigationGuardRegistry | null>(null);

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const [registry] = useState(() => new NavigationGuardRegistry());
  useEffect(() => bindNavigationGuard({ registry }), [registry]);
  return <NavigationGuardContext value={registry}>{children}</NavigationGuardContext>;
}

export function useNavigationGuardRegistry() {
  const registry = use(NavigationGuardContext);
  if (!registry) throw new Error('NavigationGuardProvider가 필요합니다.');
  return registry;
}
