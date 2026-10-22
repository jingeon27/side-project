import { useSuspenseQuery } from '@tanstack/react-query';
import { match } from 'ts-pattern';

import { LoginPage } from '@/_pages/login';
import { ReportsPage } from '@/_pages/reports';
import { SupportPage } from '@/_pages/support';
import { UsersPage } from '@/_pages/users';
import { sessionOptions } from '@/features/auth';
import { useAdminRoute } from '@/shared/lib';
import { AsyncBoundary } from '@/shared/ui';
import { AdminShell } from '@/widgets/admin-shell';

export function AdminRouter() {
  const { data: session } = useSuspenseQuery(sessionOptions());
  const route = useAdminRoute();
  if (session.user?.role !== 'ADMIN') return <LoginPage />;
  return (
    <AdminShell nickname={session.user.nickname} tab={route.tab}>
      <AsyncBoundary key={route.tab}>
        {match(route.tab)
          .with('support', () => <SupportPage threadId={route.threadId} />)
          .with('reports', () => <ReportsPage status={route.reportStatus} />)
          .with('users', () => <UsersPage userId={route.userId} />)
          .exhaustive()}
      </AsyncBoundary>
    </AdminShell>
  );
}
