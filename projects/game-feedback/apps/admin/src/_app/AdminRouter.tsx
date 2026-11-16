import { Activity, lazy } from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';
import { match } from 'ts-pattern';

import { AdminSessionExpiredError, sessionOptions } from '@/features/auth';
import { useAdminRoute } from '@/shared/lib';
import { AsyncBoundary, SessionVersionContext } from '@/shared/ui';
import { AdminShell } from '@/widgets/admin-shell';

const LoginPage = lazy(async () => {
  const page = await import('@/_pages/login');
  return { default: page.LoginPage };
});
const ReportsPage = lazy(async () => {
  const page = await import('@/_pages/reports');
  return { default: page.ReportsPage };
});
const SupportPage = lazy(async () => {
  const page = await import('@/_pages/support');
  return { default: page.SupportPage };
});
const UsersPage = lazy(async () => {
  const page = await import('@/_pages/users');
  return { default: page.UsersPage };
});

export function AdminRouter() {
  const { data: session, error, dataUpdatedAt } = useSuspenseQuery(sessionOptions());
  const route = useAdminRoute();
  if (session.user?.role !== 'ADMIN') return <LoginPage />;
  // 만료되면 화면을 내리지 않고 숨긴다. 초안은 남고 효과가 정리되어 주기 조회도 멈춘다.
  // 다른 관리자로 다시 로그인하면 key가 바뀌어 이전 관리자의 초안을 남기지 않는다.
  const expired = error instanceof AdminSessionExpiredError;
  return (
    <>
      {expired && (
        <AsyncBoundary>
          <LoginPage>
            <p role="alert">
              로그인 시간이 지났습니다. 다시 로그인하면 보던 화면과 작성하던 내용으로 돌아갑니다.
            </p>
          </LoginPage>
        </AsyncBoundary>
      )}
      {/* 다시 로그인하면 세션 데이터가 갱신되어, 만료 중에 실패한 영역이 스스로 다시 불러온다. */}
      <SessionVersionContext value={dataUpdatedAt}>
        <Activity key={session.user.id} mode={expired ? 'hidden' : 'visible'}>
          <AdminShell nickname={session.user.nickname} tab={route.tab}>
            <AsyncBoundary key={route.tab}>
              {match(route.tab)
                .with('support', () => (
                  <SupportPage
                    threadId={route.threadId}
                    status={route.supportStatus}
                    currentHash={route.hash}
                  />
                ))
                .with('reports', () => <ReportsPage status={route.reportStatus} />)
                .with('users', () => <UsersPage userId={route.userId} />)
                .exhaustive()}
            </AsyncBoundary>
          </AdminShell>
        </Activity>
      </SessionVersionContext>
    </>
  );
}
