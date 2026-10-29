'use client';

import Link from 'next/link';

import { ArrowUpRight, FileText, MessageSquare, ThumbsUp } from 'lucide-react';
import { match, P } from 'ts-pattern';

import type { Notification } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { timeAgo } from '@/shared/lib/date';

interface INotificationItemProps {
  notification: Notification;
  href: string;
  onRead: () => void;
}
const notificationTitles = {
  ANSWER: '새로운 피드백이 도착했어요',
  HELPFUL: '당신의 피드백이 도움이 됐어요',
  COMMENT: '새로운 댓글이 달렸어요',
  COMMENT_REPLY: '새로운 답글이 달렸어요',
  FOLLOWED_POST: '팔로우한 사용자의 새 글',
  CHAT_MESSAGE: '새로운 채팅이 도착했어요',
} satisfies Record<Notification['type'], string>;
export function NotificationItem({ notification, href, onRead }: INotificationItemProps) {
  const { t, locale: textLocale } = useI18n();
  // 서버는 문구를 저장하지 않는다. 현재 닉네임·제목으로 화면 언어의 문구를 만든다.
  const name = notification.actor?.nickname ?? t('알 수 없는 플레이어');
  const message = match(notification)
    .with({ type: 'ANSWER' }, (item) =>
      t('{name}님이 "{title}"에 피드백을 남겼어요.', { name, title: item.postTitle }),
    )
    .with({ type: 'HELPFUL' }, (item) =>
      t('{name}님이 "{title}"의 피드백을 도움됨으로 표시했어요.', { name, title: item.postTitle }),
    )
    .with({ type: 'COMMENT' }, (item) =>
      t('{name}님이 "{title}"에 댓글을 남겼어요.', { name, title: item.postTitle }),
    )
    .with({ type: 'COMMENT_REPLY' }, (item) =>
      t('{name}님이 "{title}"에 답글을 남겼어요.', { name, title: item.postTitle }),
    )
    .with({ type: 'FOLLOWED_POST' }, (item) =>
      t('{name}님의 새 글: {title}', { name, title: item.postTitle }),
    )
    .with({ type: 'CHAT_MESSAGE' }, () => t('{name}님이 메시지를 보냈어요.', { name }))
    .exhaustive();
  const icon = match(notification.type)
    .with('FOLLOWED_POST', () => <FileText size={22} />)
    .with('HELPFUL', () => <ThumbsUp size={22} />)
    .with(P.union('ANSWER', 'COMMENT', 'COMMENT_REPLY', 'CHAT_MESSAGE'), () => <MessageSquare size={22} />)
    .exhaustive();
  return (
    <Link
      href={href}
      className="notification-item"
      data-unread={!notification.readAt || undefined}
      onClick={() => {
        if (!notification.readAt) onRead();
      }}
    >
      <span className="notification-type">{icon}</span>
      <div>
        <strong>{t(notificationTitles[notification.type])}</strong>
        <p>{message}</p>
        <span>{timeAgo(notification.createdAt, textLocale)}</span>
      </div>
      {!notification.readAt && <span className="notification-unread">{t('읽지 않음')}</span>}
      <ArrowUpRight size={17} />
    </Link>
  );
}
