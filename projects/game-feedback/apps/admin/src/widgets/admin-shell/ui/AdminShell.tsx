import type { ReactNode } from 'react';
import { Button } from '@side/design-system';
import { useLogoutMutation } from '@/features/auth';
import type { TAdminTab } from '@/shared/lib';
import { ErrorNotice } from '@/shared/ui';
import { AdminNavigation } from './AdminNavigation';

interface IAdminShellProps {
  nickname: string;
  tab: TAdminTab;
  children: ReactNode;
}

export function AdminShell({ nickname, tab, children }: IAdminShellProps) {
  const logout = useLogoutMutation();
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <strong>Game Mate 운영 관리</strong>
        <span>{nickname}</span>
        <Button type="button" variant="ghost" disabled={logout.isPending} onClick={() => logout.mutate()}>
          로그아웃
        </Button>
      </header>
      <AdminNavigation tab={tab} />
      <main className="admin-main">
        <ErrorNotice error={logout.error} />
        {children}
      </main>
    </div>
  );
}
