'use client';

import type { ReactNode } from 'react';

import { useScrollVisibility } from '@side/design-system/lib/use-scroll-visibility';

export function ScrollHeader({ children }: { children: ReactNode }) {
  const { ref, hidden } = useScrollVisibility<HTMLElement>();

  return (
    <header ref={ref} className="site-header" data-scroll-hidden={hidden || undefined} inert={hidden}>
      {children}
    </header>
  );
}
