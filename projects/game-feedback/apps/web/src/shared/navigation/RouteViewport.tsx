'use client';
import { useEffect, useRef, Suspense, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { appRoutes, resolveAppRoute } from '@game-feedback/bridge';
import { useAnimate, useMotionPreference } from '@/shared/motion';
import { getNavigationDirection } from './browser-navigation';

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
  const previous = useRef<string | null>(null);
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
      ['feed', 'boards', 'search', 'messages', 'notifications', 'settings', 'guide', 'admin'].includes(
        route.screen,
      ) &&
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
  }, [pathname, reducedMotion, animate, scope]);
  return null;
}
