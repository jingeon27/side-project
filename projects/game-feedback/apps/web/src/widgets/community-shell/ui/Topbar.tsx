'use client';
import { useI18n } from '@/shared/i18n';
import { Button } from '@side/design-system';
import { TabLink as Link } from '@/shared/navigation';
import { resolveAppRoute } from '@game-feedback/bridge';
import { Gamepad2, ArrowUpRight, MessageCircle, Bell, Globe2 } from 'lucide-react';
import { useSession } from '@/features/auth';
import { Avatar } from '@/shared/ui';
interface ITopbarProps {
  home: string;
  path: string;
  chatUnread: number;
  unread: number;
}
export function Topbar({ home, path, chatUnread, unread }: ITopbarProps) {
  const { t } = useI18n();
  const { session, login: handleLogin } = useSession();
  const isHome = resolveAppRoute(path)?.tab === 'feed';
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href={home} className="brand" aria-label={t('플레이메이트 홈')}>
          <span className="brand-mark">
            <Gamepad2 size={24} strokeWidth={2.5} />
          </span>
          <span>{t('플레이메이트')}</span>
        </Link>
        <nav className="top-nav" aria-label={t('주 메뉴')}>
          <Link href={home} className={isHome ? 'active' : ''}>
            {t('피드백 라운지')}
          </Link>
          <Link
            href={`${home}/boards/account-trade`}
            className={resolveAppRoute(path)?.tab === 'boards' ? 'active' : ''}
          >
            {t('게시판')}
          </Link>
          <Link href={`${home}/guide`} className={path.endsWith('/guide') ? 'active' : ''}>
            {t('이용 가이드')}
            <ArrowUpRight size={13} />
          </Link>
        </nav>
        <div className="header-actions">
          <Link
            className="icon-button language-button"
            replace
            href={`${home}/settings#language`}
            aria-label={t('언어 설정')}
          >
            <Globe2 size={20} />
          </Link>
          <Link
            className="icon-button notification-button"
            aria-label={t('채팅 {count}개', { count: chatUnread })}
            href={`${home}/messages`}
          >
            <MessageCircle size={21} />
            {chatUnread > 0 && (
              <span className="header-chat-count">{chatUnread > 99 ? '99+' : chatUnread}</span>
            )}
          </Link>
          <Link
            className="icon-button notification-button"
            aria-label={t('알림 {count}개', { count: unread })}
            href={`${home}/notifications`}
          >
            <Bell size={21} />
            {unread > 0 && <span className="header-chat-count">{unread > 99 ? '99+' : unread}</span>}
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
              aria-label={t('로그인 / 시작하기')}
            >
              <span className="header-login-long">{t('로그인 / 시작하기')}</span>
              <span className="header-login-short">{t('로그인')}</span>
              <ArrowUpRight size={14} />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
