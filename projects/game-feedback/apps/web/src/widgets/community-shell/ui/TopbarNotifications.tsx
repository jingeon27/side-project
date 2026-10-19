'use client';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useSession } from '@/features/auth';
import { notificationSummaryOptions } from '@/features/notification';
import { useI18n } from '@/shared/i18n';
import { TabLink } from '@/shared/navigation';

export function TopbarNotifications({ href }: { href: string }) {
  const { t } = useI18n();
  const { session } = useSession();
  const { data } = useQuery(notificationSummaryOptions(session.user?.id));
  const unread = data?.unreadCount ?? 0;
  return (
    <TabLink
      className="icon-button notification-button"
      aria-label={t('알림 {count}개', { count: unread })}
      href={href}
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
  );
}
