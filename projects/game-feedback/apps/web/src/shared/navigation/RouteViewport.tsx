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
    const target = scope.current;
    if (!target) return;
    // 캐시된 화면이 다시 보여도 이전 애니메이션 값으로 본문이 밀리지 않게 한다.
    target.style.removeProperty('transform');
    target.style.removeProperty('opacity');
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
    if (!before || before === key || reducedMotion) return;
    if (route?.screen === 'conversation' && window.matchMedia('(max-width: 760px)').matches) return;
    const controls = animate(
      target,
      {
        opacity: [0.85, 1],
      },
      { duration: 0.18, ease: 'easeOut' },
    );
    return () => {
      controls.stop();
      target.style.removeProperty('opacity');
    };
  }, [pathname, reducedMotion, animate, scope, previous]);
  return null;
}
