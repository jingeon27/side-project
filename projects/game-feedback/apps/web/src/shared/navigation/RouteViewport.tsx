'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { appRoutes, resolveAppRoute } from '@game-feedback/bridge';
import { useAnimate, useMotionPreference } from '@/shared/motion';
import { getNavigationDirection } from './browser-navigation';

export function RouteViewport({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reducedMotion = useMotionPreference();
  const previous = useRef<string | null>(null);
  const [scope, animate] = useAnimate<HTMLElement>();
  useEffect(() => {
    const route = resolveAppRoute(pathname);
    const key = route?.tab === 'messages' ? appRoutes.messages(route.locale) : pathname;
    const before = previous.current;
    previous.current = key;
    if (!before || before === key || reducedMotion || !scope.current) return;
    const controls = animate(
      scope.current,
      {
        opacity: [0.85, 1],
        x: getNavigationDirection() === 'back' ? [-8, 0] : [8, 0],
      },
      { duration: 0.18, ease: 'easeOut' },
    );
    return () => controls.complete();
  }, [pathname, reducedMotion, animate, scope]);
  return (
    <main ref={scope} className="main-content">
      {children}
    </main>
  );
}
