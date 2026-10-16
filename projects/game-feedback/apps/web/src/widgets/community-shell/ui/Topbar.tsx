'use client';
import { Button } from '@side/design-system';
import Link from 'next/link';
import { Gamepad2, ArrowUpRight, MessageCircle, Bell } from 'lucide-react';
import { useSession } from '@/features/auth';
import { Avatar } from '@/shared/ui';
interface ITopbarProps {
  home: string;
  path: string;
  chatUnread: number;
  unread: number;
}
export function Topbar({ home, path, chatUnread, unread }: ITopbarProps) {
  const { session, login: handleLogin } = useSession();
  const isHome = path === home;
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href={home} className="brand" aria-label="플레이메이트 홈">
          <span className="brand-mark">
            <Gamepad2 size={24} strokeWidth={2.5} />
          </span>
          <span>
            플레이메이트<span className="alpha-tag">ALPHA</span>
          </span>
        </Link>
        <nav className="top-nav" aria-label="주 메뉴">
          <Link href={home} className={isHome ? 'active' : ''}>
            피드백 라운지
          </Link>
          <Link href={`${home}/guide`} className={path.endsWith('/guide') ? 'active' : ''}>
            이용 가이드
            <ArrowUpRight size={13} />
          </Link>
        </nav>
        <div className="header-actions">
          <Link
            className="icon-button notification-button"
            aria-label={`채팅 ${chatUnread}개`}
            href={`${home}/messages`}
          >
            <MessageCircle size={21} />
            {chatUnread > 0 && (
              <span className="header-chat-count">{chatUnread > 99 ? '99+' : chatUnread}</span>
            )}
          </Link>
          <Link
            className="icon-button notification-button"
            aria-label={`알림 ${unread}개`}
            href={`${home}/notifications`}
          >
            <Bell size={21} />
            {unread > 0 && <span className="notification-dot" />}
          </Link>
          {session?.user ? (
            <Link href={`${home}/settings`} className="user-button">
              <Avatar name={session.user.nickname} size="small" />
              <span>{session.user.nickname}</span>
            </Link>
          ) : (
            <Button
              variant="primary"
              size="sm"
              type="button"
              className="button dark small-button"
              onClick={handleLogin}
              aria-label="로그인 / 시작하기"
            >
              <span className="header-login-long">로그인 / 시작하기</span>
              <span className="header-login-short">로그인</span>
              <ArrowUpRight size={14} />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
