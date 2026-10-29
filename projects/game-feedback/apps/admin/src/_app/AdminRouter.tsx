import { lazy } from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';
import { match } from 'ts-pattern';

import { sessionOptions } from '@/features/auth';
import { useAdminRoute } from '@/shared/lib';
import { AsyncBoundary } from '@/shared/ui';
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
  const { data: session } = useSuspenseQuery(sessionOptions());
  const route = useAdminRoute();
  if (session.user?.role !== 'ADMIN') return <LoginPage />;
  return (
    <AdminShell nickname={session.user.nickname} tab={route.tab}>
      <AsyncBoundary key={route.tab}>
        {match(route.tab)
          .with('support', () => (
            <SupportPage threadId={route.threadId} status={route.supportStatus} currentHash={route.hash} />
          ))
          .with('reports', () => <ReportsPage status={route.reportStatus} />)
          .with('users', () => <UsersPage userId={route.userId} />)
          .exhaustive()}
      </AsyncBoundary>
    </AdminShell>
  );
}
