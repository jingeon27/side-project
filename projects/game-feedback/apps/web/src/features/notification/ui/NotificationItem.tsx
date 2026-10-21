'use client';

import Link from 'next/link';

import { ArrowUpRight, FileText, MessageSquare, ThumbsUp } from 'lucide-react';

import type { Notification } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { timeAgo } from '@/shared/lib/date';

interface INotificationItemProps {
  notification: Notification;
  href: string;
  onRead: () => void;
}
const notificationTitles: Record<Notification['type'], string> = {
  ANSWER: '새로운 피드백이 도착했어요',
  HELPFUL: '당신의 피드백이 도움이 됐어요',
  COMMENT: '새로운 댓글이 달렸어요',
  FOLLOWED_POST: '팔로우한 사용자의 새 글',
};
export function NotificationItem({ notification, href, onRead }: INotificationItemProps) {
  const { t, locale: textLocale } = useI18n();
  return (
    <Link
      href={href}
      className={`notification-item ${notification.readAt ? '' : 'unread'}`}
      onClick={() => {
        if (!notification.readAt) onRead();
      }}
    >
      <span className="notification-type">
        {notification.type === 'FOLLOWED_POST' ? (
          <FileText size={22} />
        ) : notification.type === 'HELPFUL' ? (
          <ThumbsUp size={22} />
        ) : (
          <MessageSquare size={22} />
        )}
      </span>
      <div>
        <strong>{t(notificationTitles[notification.type])}</strong>
        <p>{notification.message}</p>
        <span>{timeAgo(notification.createdAt, textLocale)}</span>
      </div>
      {!notification.readAt && <span className="notification-unread">{t('읽지 않음')}</span>}
      <ArrowUpRight size={17} />
    </Link>
  );
}
