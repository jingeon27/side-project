'use client';
import { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Bell } from 'lucide-react';
import { Button } from '@side/design-system';
import { LanguageSelect, useI18n } from '@/shared/i18n';
import { TabLink } from '@/shared/navigation';
import { useSession } from '@/features/auth';
import { notificationSummaryOptions } from '@/features/notification';
import { Avatar } from '@/shared/ui';
import { HeaderSearch } from './HeaderSearch';
export function TopbarActions({
  home,
  search = false,
  account = true,
}: {
  home: string;
  search?: boolean;
  account?: boolean;
}) {
  const { t } = useI18n();
  const { session, login: handleLogin } = useSession();
  const { data } = useQuery(notificationSummaryOptions(session.user?.id));
  const unread = data?.unreadCount ?? 0;
  return (
    <div className="header-actions">
      {search && (
        <Suspense fallback={null}>
          <HeaderSearch />
        </Suspense>
      )}
      <LanguageSelect compact />
      <TabLink
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
      </TabLink>
      {account && (
        <div className="header-account">
          {session.user ? (
            <TabLink href={`${home}/settings`} className="user-button" aria-label={t('프로필')}>
              <Avatar name={session.user.nickname} size="small" />
              <span>{session.user.nickname}</span>
            </TabLink>
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
      )}
    </div>
  );
}
