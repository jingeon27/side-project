import { appRoutes, resolveAppRoute } from '@game-feedback/bridge';

interface IOnboardingSession {
  needsOnboarding: boolean;
}

export function onboardingRedirect(path: string, session: IOnboardingSession): string | null {
  const route = resolveAppRoute(path);
  if (!route || route.screen === 'onboarding') return null;
  if (session.needsOnboarding) {
    if (['terms', 'privacy', 'contact'].includes(route.screen)) return null;
    const returnTo = route.screen === 'login' ? (route.parent ?? appRoutes.feed(route.locale)) : route.path;
    return appRoutes.onboarding(route.locale, returnTo);
  }
  return null;
}
