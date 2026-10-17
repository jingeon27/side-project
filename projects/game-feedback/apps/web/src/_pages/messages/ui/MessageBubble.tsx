'use client';
import { useI18n } from '@/shared/i18n';
import { Check } from 'lucide-react';
import type { ChatMessage } from '@/shared/api';
import { formatTime, isAtOrBefore } from '@/shared/lib/date';
import { Avatar } from '@/shared/ui';

interface IMessageBubbleProps {
  message: ChatMessage;
  mine: boolean;
  index: number;
  peerLastReadAt: string | null;
}

export function MessageBubble({ message, mine, index, peerLastReadAt }: IMessageBubbleProps) {
  const { t, locale: textLocale } = useI18n();
  const read = mine && isAtOrBefore(message.createdAt, peerLastReadAt);
  return (
    <div
      className={`chat-message ${mine ? 'mine' : 'theirs'}`}
      data-testid={`message-${message.id}`}
      data-message-id={message.id}
      data-message-index={index}
    >
      {!mine && <Avatar name={message.sender.nickname} size="small" />}
      <div className="chat-message-content">
        <p className="chat-bubble">{message.body}</p>
        <div className="chat-message-meta">
          <time dateTime={message.createdAt}>{formatTime(message.createdAt, textLocale)}</time>
          {mine && (
            <span className={read ? 'message-read' : ''}>
              {read ? (
                <>
                  <Check size={10} />
                  {t('읽음')}
                </>
              ) : (
                t('전송됨')
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
