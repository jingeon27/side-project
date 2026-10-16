'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Globe2 } from 'lucide-react';
import { useSession } from '@/features/auth';
import { notificationSummaryOptions } from '@/features/notification';
import { conversationBadgeOptions } from '@/features/chat';
import { useChatConnection } from '@/widgets/chat-realtime';
import { Topbar } from './Topbar';
import { LeftSidebar } from './LeftSidebar';
import { PlayerSidebar } from './PlayerSidebar';
import { MobileNav } from './MobileNav';

export function CommunityShell({ children, locale }: { children: ReactNode; locale: string }) {
  const { session } = useSession();
  const path = usePathname();
  const connection = useChatConnection();
  const { data: notifications } = useQuery(notificationSummaryOptions(session?.user?.id));
  const { data: conversations } = useQuery({
    ...conversationBadgeOptions(session?.user?.id),
    refetchInterval: connection === 'live' ? false : 10_000,
  });
  const chatUnread = conversations?.unreadCount ?? 0;
  const unread = notifications?.unreadCount ?? 0;
  const home = `/${locale}`;
  return (
    <>
      <Topbar home={home} path={path} chatUnread={chatUnread} unread={unread} />
      {locale !== 'ko' && (
        <div className="language-banner">
          <Globe2 size={16} />
          <span>
            {locale === 'ja'
              ? '日本語の翻訳は準備中です。アルファ版は韓国語で提供しています。'
              : 'English translation is in progress. This alpha is currently available in Korean.'}
          </span>
          <Link href="/ko">한국어로 보기</Link>
        </div>
      )}
      <div className={`site-grid ${path.endsWith('/messages') ? 'chat-layout' : ''}`}>
        <LeftSidebar home={home} path={path} unread={unread} chatUnread={chatUnread} />
        <main className="main-content">{children}</main>
        <PlayerSidebar home={home} />
      </div>
      <MobileNav home={home} path={path} chatUnread={chatUnread} />
    </>
  );
}
