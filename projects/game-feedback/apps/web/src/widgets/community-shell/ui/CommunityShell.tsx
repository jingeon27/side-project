'use client';

import { createContext, Suspense, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { useQuery } from '@tanstack/react-query';

import { appRoutes, resolveAppRoute } from '@game-feedback/bridge';

import { useSession } from '@/features/auth';
import { conversationBadgeOptions } from '@/features/chat';
import { useI18n } from '@/shared/i18n';
import { RouteViewportProvider } from '@/shared/navigation';
import { ServiceErrorBoundary } from '@/shared/ui';
import { useChatConnection } from '@/widgets/chat-realtime';

import { CommunityFooter } from './CommunityFooter';
import { MobileNav } from './MobileNav';

interface ICommunityShellProps {
  children: ReactNode;
  locale: string;
}
export const ChatUnreadContext = createContext(0);

export function CommunityShell({ children, locale }: ICommunityShellProps) {
  const { t } = useI18n();
  const { session } = useSession();
  const connection = useChatConnection();
  const { data: conversations } = useQuery({
    ...conversationBadgeOptions(session?.user?.id),
    refetchInterval: connection === 'live' ? false : 10_000,
  });
  const chatUnread = conversations?.unreadCount ?? 0;
  const home = appRoutes.feed(locale);
  const userKey = session?.user?.id ?? 'anonymous';
  return (
    <div className="community-shell">
      <Suspense fallback={null}>
        <ShellScreen />
      </Suspense>
      <ChatUnreadContext value={chatUnread}>
        <RouteViewportProvider>{children}</RouteViewportProvider>
      </ChatUnreadContext>
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
function MobileNavigationRoute({ home, chatUnread }: { home: string; chatUnread: number }) {
  return <MobileNav home={home} path={useShellPath()} chatUnread={chatUnread} />;
}
