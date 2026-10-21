import { appRoutes, resolveAppRoute } from '@game-feedback/bridge';
import { LoginPage } from './ui/LoginPage';
import { LoginTopbar } from './ui/LoginTopbar';

interface ILoginRouteProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ returnTo?: string | string[]; login?: string | string[] }>;
}
async function readRoute({ params, searchParams }: ILoginRouteProps) {
  const { locale } = await params;
  const query = await searchParams;
  const route = resolveAppRoute(
    appRoutes.login(locale, typeof query.returnTo === 'string' ? query.returnTo : undefined),
  );
  return {
    locale,
    returnTo: route?.parent ?? appRoutes.feed(locale),
    cancelled: query.login === 'cancelled',
  };
}
export async function LoginRoute(props: ILoginRouteProps) {
  return <LoginPage {...await readRoute(props)} />;
}
export async function LoginTopbarRoute(props: ILoginRouteProps) {
  return <LoginTopbar returnTo={(await readRoute(props)).returnTo} />;
}
