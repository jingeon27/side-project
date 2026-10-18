'use client';
import { LanguageSelect, useI18n } from '@/shared/i18n';
import { Button } from '@side/design-system';
import { TabLink as Link } from '@/shared/navigation';
import { Gamepad2, ArrowUpRight, Bell } from 'lucide-react';
import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { resolveAppRoute, type TAppScreen } from '@game-feedback/bridge';
import { useSession } from '@/features/auth';
import { Avatar } from '@/shared/ui';
import { HeaderSearch } from './HeaderSearch';
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
        <div className="mobile-page-title">
          <Suspense fallback={null}>
            <CurrentPageTitle />
          </Suspense>
        </div>
        <div className="header-actions">
          <Suspense fallback={null}>
            <HeaderSearch />
          </Suspense>
          <LanguageSelect compact />
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

const screenTitles = {
  search: '검색',
  feed: '홈',
  boards: '홈',
  post: '게시글',
  compose: '글쓰기',
  guide: '가이드',
  messages: '채팅',
  conversation: '채팅',
  settings: '프로필',
  profile: '프로필',
  notifications: '알림',
  admin: '관리자',
  contact: '문의하기',
  terms: '이용약관',
  privacy: '개인정보 처리방침',
} satisfies Record<TAppScreen, string>;

function CurrentPageTitle() {
  const { t } = useI18n();
  const pathname = usePathname();
  const screen = resolveAppRoute(pathname)?.screen;
  return <p>{t(screen ? screenTitles[screen] : '홈')}</p>;
}
