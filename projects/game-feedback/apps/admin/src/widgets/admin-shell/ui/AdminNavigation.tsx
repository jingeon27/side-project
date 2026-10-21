import type { ReactNode } from 'react';

import type { TAdminTab } from '@/shared/lib';

interface IAdminNavigationLinkProps {
  tab: TAdminTab;
  currentTab: TAdminTab;
  children: ReactNode;
}

function AdminNavigationLink({ tab, currentTab, children }: IAdminNavigationLinkProps) {
  return (
    <a href={`#${tab}`} aria-current={currentTab === tab ? 'page' : undefined}>
      {children}
    </a>
  );
}

export function AdminNavigation({ tab }: { tab: TAdminTab }) {
  return (
    <nav className="admin-nav" aria-label="관리자 메뉴">
      <AdminNavigationLink tab="support" currentTab={tab}>
        문의함
      </AdminNavigationLink>
      <AdminNavigationLink tab="reports" currentTab={tab}>
        신고함
      </AdminNavigationLink>
      <AdminNavigationLink tab="users" currentTab={tab}>
        사용자 관리
      </AdminNavigationLink>
    </nav>
  );
}
