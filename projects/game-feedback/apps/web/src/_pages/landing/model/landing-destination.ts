import { appRoutes, resolveAppRoute } from '@game-feedback/bridge';

export function landingDestination(redirect: string | null) {
  const route = redirect ? resolveAppRoute(redirect) : null;
  if (!route || route.screen === 'login' || route.screen === 'onboarding')
    return { href: appRoutes.feed('ko'), screen: 'feed' as const, redirected: false };
  return { href: route.path, screen: route.screen, redirected: true };
}
