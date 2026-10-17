'use client';
import { useI18n } from '@/shared/i18n';
import { Button } from '@side/design-system';
import { TabLink as Link } from '@/shared/navigation';
import { Gamepad2, ArrowUpRight, Bell, Globe2 } from 'lucide-react';
import { useSession } from '@/features/auth';
import { Avatar } from '@/shared/ui';
interface ITopbarProps {
  home: string;
  unread: number;
}
export function Topbar({ home, unread }: ITopbarProps) {
  const { t } = useI18n();
  const { session, login: handleLogin } = useSession();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href={home} className="brand" aria-label={t('플레이메이트 홈')}>
          <span className="brand-mark">
            <Gamepad2 size={24} strokeWidth={2.5} />
          </span>
          <span>{t('플레이메이트')}</span>
        </Link>
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
            aria-label={t('알림 {count}개', { count: unread })}
            href={`${home}/notifications`}
          >
            <Bell size={21} />
            {unread > 0 && (
              <>
                <span className="header-notification-count" aria-hidden="true">
                  {unread > 99 ? '99+' : unread}
                </span>
                <span className="notification-unread-indicator" aria-hidden="true" />
              </>
            )}
          </Link>
          <div className="header-account">
            {session?.user ? (
              <Link href={`${home}/settings`} className="user-button" aria-label={t('프로필')}>
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
      </div>
    </header>
  );
}
