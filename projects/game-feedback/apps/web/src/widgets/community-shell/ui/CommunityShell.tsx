'use client';
import { useI18n } from '@/shared/i18n';
import type { ReactNode } from 'react';
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
import { PlayerSidebar } from './PlayerSidebar';
import { MobileNav } from './MobileNav';

export function CommunityShell({ children, locale }: { children: ReactNode; locale: string }) {
  const { t } = useI18n();
  const { session } = useSession();
  const pathname = usePathname();
  const search = useSearchParams();
  const path = resolveAppRoute(`${pathname}${search.size ? `?${search}` : ''}`)?.path ?? pathname;
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
    <>
      <ServiceErrorBoundary title={t('상단 메뉴')} resetKey={userKey}>
        <Topbar home={home} path={path} chatUnread={chatUnread} unread={unread} />
      </ServiceErrorBoundary>
      <div className={`site-grid ${resolveAppRoute(path)?.tab === 'messages' ? 'chat-layout' : ''}`}>
        <div className="shell-left-sidebar">
          <ServiceErrorBoundary title={t('탐색 메뉴')} resetKey={userKey}>
            <LeftSidebar home={home} path={path} unread={unread} chatUnread={chatUnread} />
          </ServiceErrorBoundary>
        </div>
        <RouteViewport>
          <ServiceErrorBoundary title={t('이 화면')} resetKey={userKey} refreshOnRetry>
            {children}
          </ServiceErrorBoundary>
        </RouteViewport>
        <div className="shell-player-sidebar">
          <ServiceErrorBoundary title={t('플레이어 프로필')} resetKey={userKey}>
            <PlayerSidebar home={home} />
          </ServiceErrorBoundary>
        </div>
      </div>
      <ServiceErrorBoundary title={t('하단 메뉴')} resetKey={userKey}>
        <MobileNav home={home} path={path} chatUnread={chatUnread} />
      </ServiceErrorBoundary>
    </>
  );
}
