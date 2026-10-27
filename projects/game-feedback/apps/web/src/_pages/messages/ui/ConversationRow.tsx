'use client';

import Link from 'next/link';

import { appRoutes } from '@game-feedback/bridge';

import { UserBadges } from '@/features/user';
import type { Conversation } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { timeAgo } from '@/shared/lib/date';
import { Avatar } from '@/shared/ui';

interface IConversationRowProps {
  conversation: Conversation;
  selected: boolean;
  locale: string;
  replace: boolean;
}

export function ConversationRow({ conversation, selected, locale, replace }: IConversationRowProps) {
  const { t, locale: textLocale } = useI18n();
  return (
    <Link
      href={appRoutes.conversation(locale, conversation.id)}
      replace={replace}
      scroll={false}
      className="conversation-row"
      data-testid={`conversation-${conversation.id}`}
      aria-label={`${t('{name}님과의 대화', { name: conversation.peer.nickname })}${conversation.unreadCount ? `, ${t('읽지 않은 메시지 {count}개', { count: conversation.unreadCount })}` : ''}`}
      aria-current={selected ? 'page' : undefined}
    >
      <Avatar src={conversation.peer.avatarUrl} name={conversation.peer.nickname} />
      <div className="conversation-preview">
        <div>
          <strong>{conversation.peer.nickname}</strong>
          <time dateTime={conversation.updatedAt}>{timeAgo(conversation.updatedAt, textLocale)}</time>
        </div>
        <UserBadges author={conversation.peer} compact />
        <div>
          <p>
            {conversation.lastMessage?.body ||
              (conversation.lastMessage?.attachments?.length
                ? t(
                    conversation.lastMessage.attachments[0]?.kind === 'VIDEO'
                      ? '동영상을 보냈어요'
                      : '이미지를 보냈어요',
                  )
                : t('첫 메시지로 이야기를 시작해요'))}
          </p>
          {conversation.unreadCount > 0 && (
            <span className="chat-unread-count">
              {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
