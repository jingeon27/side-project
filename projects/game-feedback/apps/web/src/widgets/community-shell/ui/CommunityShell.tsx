'use client';
import { useI18n } from '@/shared/i18n';
import { Suspense, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/features/auth';
import { notificationSummaryOptions } from '@/features/notification';
import { conversationBadgeOptions } from '@/features/chat';
import { useChatConnection } from '@/widgets/chat-realtime';
import { ServiceErrorBoundary } from '@/shared/ui';
import { RouteViewport } from '@/shared/navigation';
import { resolveAppRoute } from '@game-feedback/bridge';
import { Topbar } from './Topbar';
import { LeftSidebar } from './LeftSidebar';
import { MobileNav } from './MobileNav';
import { GameBoardNavigation } from './GameBoardNavigation';
import { CommunityFooter } from './CommunityFooter';

interface ICommunityShellProps {
  children: ReactNode;
  locale: string;
}
export function CommunityShell({ children, locale }: ICommunityShellProps) {
  const { t } = useI18n();
  const { session } = useSession();
  const connection = useChatConnection();
  const { data: notifications } = useQuery(notificationSummaryOptions(session?.user?.id));
  const { data: conversations } = useQuery({
    ...conversationBadgeOptions(session?.user?.id),
    refetchInterval: connection === 'live' ? false : 10_000,
  });
  const chatUnread = conversations?.unreadCount ?? 0;
  const unread = notifications?.unreadCount ?? 0;
  const home = `/${locale}`;
  const userKey = session?.user?.id ?? 'anonymous';
  return (
    <div className="community-shell">
      <Suspense fallback={null}>
        <ShellScreen />
      </Suspense>
      <ServiceErrorBoundary title={t('상단 메뉴')} resetKey={userKey}>
        <Topbar home={home} unread={unread} />
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
            <Suspense fallback={null}>
              <BoardNavigationRoute locale={locale} />
            </Suspense>
            {children}
          </ServiceErrorBoundary>
        </RouteViewport>
      </div>
      <ServiceErrorBoundary title={t('서비스 안내')} resetKey={userKey}>
        <CommunityFooter home={home} />
      </ServiceErrorBoundary>
      <ServiceErrorBoundary title={t('하단 메뉴')} resetKey={userKey}>
        <Suspense fallback={<MobileNav home={home} path="" chatUnread={chatUnread} />}>
          <MobileNavigationRoute home={home} chatUnread={chatUnread} />
        </Suspense>
      </ServiceErrorBoundary>
    </div>
  );
}

function useShellPath() {
  const pathname = usePathname();
  const search = useSearchParams();
  return resolveAppRoute(`${pathname}${search.size ? `?${search}` : ''}`)?.path ?? pathname;
}
function ShellScreen() {
  const path = useShellPath();
  return <span className="shell-route" hidden data-screen={resolveAppRoute(path)?.screen} />;
}
function SidebarRoute({ home, chatUnread }: { home: string; chatUnread: number }) {
  return <LeftSidebar home={home} path={useShellPath()} chatUnread={chatUnread} />;
}
function MobileNavigationRoute({ home, chatUnread }: { home: string; chatUnread: number }) {
  return <MobileNav home={home} path={useShellPath()} chatUnread={chatUnread} />;
}
function BoardNavigationRoute({ locale }: { locale: string }) {
  return <GameBoardNavigation locale={locale} path={useShellPath()} />;
}
