'use client';

import { useCallback, useState, type ReactNode } from 'react';

import { nextHeaderScrollState, type IHeaderScrollState } from '../model/header-scroll-state';

function scrollPosition() {
  return Math.max(0, Math.min(window.scrollY, document.documentElement.scrollHeight - window.innerHeight));
}

export function ScrollHeader({ children }: { children: ReactNode }) {
  const [scrollState, setScrollState] = useState<IHeaderScrollState>({ hidden: false, edgeY: 0 });
  const attachHeader = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    setScrollState({ hidden: false, edgeY: scrollPosition() });
    const handleScroll = () => {
      const y = scrollPosition();
      setScrollState((previous) => nextHeaderScrollState(previous, y));
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      ref={attachHeader}
      className="site-header"
      data-scroll-hidden={scrollState.hidden || undefined}
      inert={scrollState.hidden}
    >
      {children}
    </header>
  );
}
