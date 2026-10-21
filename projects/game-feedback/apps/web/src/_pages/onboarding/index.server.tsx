import { redirect } from 'next/navigation';
import { appRoutes, resolveAppRoute } from '@game-feedback/bridge';
import { getServerSession } from '@/features/auth/index.server';
import { OnboardingPage } from './ui/OnboardingPage';
import { OnboardingTopbar } from './ui/OnboardingTopbar';

interface IOnboardingRouteProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}

async function readRoute({ params, searchParams }: IOnboardingRouteProps) {
  const { locale } = await params;
  const query = await searchParams;
  const route = resolveAppRoute(
    appRoutes.onboarding(locale, typeof query.returnTo === 'string' ? query.returnTo : undefined),
  );
  return { locale, returnTo: route?.parent ?? appRoutes.feed(locale) };
}

export async function OnboardingRoute(props: IOnboardingRouteProps) {
  const [{ locale, returnTo }, session] = await Promise.all([readRoute(props), getServerSession()]);
  if (!session.needsOnboarding) {
    redirect(session.user ? returnTo : appRoutes.login(locale, returnTo));
  }
  return <OnboardingPage locale={locale} returnTo={returnTo} />;
}

export async function OnboardingTopbarRoute(props: IOnboardingRouteProps) {
  return <OnboardingTopbar returnTo={(await readRoute(props)).returnTo} />;
}
