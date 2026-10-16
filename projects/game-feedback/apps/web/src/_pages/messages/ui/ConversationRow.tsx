import Link from 'next/link';
import { UserBadges } from '@/features/user';
import type { Conversation } from '@/shared/api';
import { timeAgo } from '@/shared/lib/date';
import { Avatar } from '@/shared/ui';
import { appRoutes } from '@game-feedback/bridge';

interface IConversationRowProps {
  conversation: Conversation;
  selected: boolean;
  locale: string;
  replace: boolean;
}

export function ConversationRow({ conversation, selected, locale, replace }: IConversationRowProps) {
  return (
    <Link
      href={appRoutes.conversation(locale, conversation.id)}
      replace={replace}
      scroll={false}
      className={`conversation-row ${selected ? 'selected' : ''}`}
      data-testid={`conversation-${conversation.id}`}
      aria-label={`${conversation.peer.nickname}님과의 대화${conversation.unreadCount ? `, 읽지 않은 메시지 ${conversation.unreadCount}개` : ''}`}
      aria-current={selected ? 'page' : undefined}
    >
      <Avatar name={conversation.peer.nickname} />
      <div className="conversation-preview">
        <div>
          <strong>{conversation.peer.nickname}</strong>
          <time dateTime={conversation.updatedAt}>{timeAgo(conversation.updatedAt)}</time>
        </div>
        <UserBadges author={conversation.peer} compact />
        <div>
          <p>{conversation.lastMessage?.body || '첫 메시지로 이야기를 시작해요'}</p>
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
