import { lazy } from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';
import { match } from 'ts-pattern';

import { sessionOptions } from '@/features/auth';
import { useAdminRoute } from '@/shared/lib';
import { AsyncBoundary } from '@/shared/ui';
import { AdminShell } from '@/widgets/admin-shell';

const LoginPage = lazy(() => import('@/_pages/login').then((page) => ({ default: page.LoginPage })));
const ReportsPage = lazy(() => import('@/_pages/reports').then((page) => ({ default: page.ReportsPage })));
const SupportPage = lazy(() => import('@/_pages/support').then((page) => ({ default: page.SupportPage })));
const UsersPage = lazy(() => import('@/_pages/users').then((page) => ({ default: page.UsersPage })));

export function AdminRouter() {
  const { data: session } = useSuspenseQuery(sessionOptions());
  const route = useAdminRoute();
  if (session.user?.role !== 'ADMIN') return <LoginPage />;
  return (
    <AdminShell nickname={session.user.nickname} tab={route.tab}>
      <AsyncBoundary key={route.tab}>
        {match(route.tab)
          .with('support', () => <SupportPage threadId={route.threadId} status={route.supportStatus} />)
          .with('reports', () => <ReportsPage status={route.reportStatus} />)
          .with('users', () => <UsersPage userId={route.userId} />)
          .exhaustive()}
      </AsyncBoundary>
    </AdminShell>
  );
}
