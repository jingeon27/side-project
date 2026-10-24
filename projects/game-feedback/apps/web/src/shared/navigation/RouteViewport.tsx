'use client';

import {
  createContext,
  Suspense,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { usePathname } from 'next/navigation';

import { appRoutes, resolveAppRoute } from '@game-feedback/bridge';

import { useAnimate, useMotionPreference } from '@/shared/motion';

import { getNavigationDirection } from './browser-navigation';

const RoutePathContext = createContext<RefObject<string | null> | null>(null);

export function RouteViewportProvider({ children }: { children: ReactNode }) {
  const previous = useRef<string | null>(null);
  return <RoutePathContext value={previous}>{children}</RoutePathContext>;
}

export function RouteViewport({ children }: { children: ReactNode }) {
  const [scope, animate] = useAnimate<HTMLElement>();
  return (
    <main ref={scope} className="main-content">
      <Suspense fallback={null}>
        <RouteMotion scope={scope} animate={animate} />
      </Suspense>
      {children}
    </main>
  );
}
function RouteMotion({
  scope,
  animate,
}: {
  scope: ReturnType<typeof useAnimate<HTMLElement>>[0];
  animate: ReturnType<typeof useAnimate<HTMLElement>>[1];
}) {
  const pathname = usePathname();
  const reducedMotion = useMotionPreference();
  const localPrevious = useRef<string | null>(null);
  const previous = useContext(RoutePathContext) ?? localPrevious;
  useEffect(() => {
    const route = resolveAppRoute(pathname);
    const key = route?.tab === 'messages' ? appRoutes.messages(route.locale) : pathname;
    const before = previous.current;
    previous.current = key;
    const beforeRoute = before ? resolveAppRoute(before) : null;
    if (
      before &&
      before !== key &&
      beforeRoute?.locale === route?.locale &&
      route &&
      [
        'feed',
        'boards',
        'search',
        'messages',
        'notifications',
        'settings',
        'guide',
        'login',
        'onboarding',
      ].includes(route.screen) &&
      getNavigationDirection() !== 'back' &&
      !window.location.hash
    )
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (!before || before === key || reducedMotion || !scope.current) return;
    if (route?.screen === 'conversation' && window.matchMedia('(max-width: 760px)').matches) return;
    const controls = animate(
      scope.current,
      {
        opacity: [0.85, 1],
        x: getNavigationDirection() === 'back' ? [-8, 0] : [8, 0],
      },
      { duration: 0.18, ease: 'easeOut' },
    );
    return () => controls.complete();
  }, [pathname, reducedMotion, animate, scope, previous]);
  return null;
}
