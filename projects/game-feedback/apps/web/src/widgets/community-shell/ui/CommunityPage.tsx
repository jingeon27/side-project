'use client';

import { Suspense, useContext, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { appRoutes, resolveAppRoute } from '@game-feedback/bridge';

import { useSession } from '@/features/auth';
import { useI18n } from '@/shared/i18n';
import { RouteViewport } from '@/shared/navigation';
import { ServiceErrorBoundary } from '@/shared/ui';

import { ChatUnreadContext } from './CommunityShell';
import { GameBoardNavigation } from './navigation/GameBoardNavigation';
import { LeftSidebar } from './navigation/LeftSidebar';

export function CommunityPage({
  children,
  locale,
  topbar,
  boardHeading,
}: {
  children: ReactNode;
  locale: string;
  topbar: ReactNode;
  boardHeading?: ReactNode;
}) {
  const { t } = useI18n();
  const { session } = useSession();
  const chatUnread = useContext(ChatUnreadContext);
  const userKey = session.user?.id ?? 'anonymous';
  const home = appRoutes.feed(locale);
  return (
    <>
      <ServiceErrorBoundary title={t('상단 메뉴')} resetKey={userKey}>
        {topbar}
      </ServiceErrorBoundary>
      <div className="site-grid">
        <div className="shell-left-sidebar">
          <ServiceErrorBoundary title={t('탐색 메뉴')} resetKey={userKey}>
            <Suspense fallback={<LeftSidebar home={home} path="" chatUnread={chatUnread} />}>
              <SidebarRoute home={home} chatUnread={chatUnread} />
            </Suspense>
          </ServiceErrorBoundary>
        </div>
        <RouteViewport>
          <ServiceErrorBoundary title={t('이 화면')} resetKey={userKey} refreshOnRetry>
            <Suspense fallback={boardHeading ?? null}>
              <BoardNavigationRoute locale={locale} heading={boardHeading} />
            </Suspense>
            {children}
          </ServiceErrorBoundary>
        </RouteViewport>
      </div>
    </>
  );
}
function usePagePath() {
  const pathname = usePathname();
  const search = useSearchParams();
  return resolveAppRoute(`${pathname}${search.size ? `?${search}` : ''}`)?.path ?? pathname;
}
function SidebarRoute({ home, chatUnread }: { home: string; chatUnread: number }) {
  return <LeftSidebar home={home} path={usePagePath()} chatUnread={chatUnread} />;
}
function BoardNavigationRoute({ locale, heading }: { locale: string; heading?: ReactNode }) {
  return <GameBoardNavigation locale={locale} path={usePagePath()} heading={heading} />;
}
