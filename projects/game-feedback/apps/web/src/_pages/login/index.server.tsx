import { appRoutes, resolveAppRoute } from '@game-feedback/bridge';
import { LoginFailureSchema } from '@game-feedback/contracts';

import { CommunityPage } from '@/widgets/community-shell';

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
  // 소셜 로그인 콜백이 실패하면 API가 이유를 login 쿼리로 붙여 보낸다. 모르는 값은 안내하지 않는다.
  const failure = LoginFailureSchema.safeParse(query.login);
  return {
    locale,
    returnTo: route?.parent ?? appRoutes.feed(locale),
    failure: failure.success ? failure.data : null,
  };
}
export async function LoginRoute(props: ILoginRouteProps) {
  const route = await readRoute(props);
  return (
    <CommunityPage screenKey="login" locale={route.locale} topbar={<LoginTopbar returnTo={route.returnTo} />}>
      <LoginPage {...route} />
    </CommunityPage>
  );
}
