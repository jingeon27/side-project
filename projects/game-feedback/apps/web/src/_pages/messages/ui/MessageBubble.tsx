import { Check } from 'lucide-react';
import type { ChatMessage } from '@/shared/api';
import { Avatar } from '@/shared/ui';

interface IMessageBubbleProps {
  message: ChatMessage;
  mine: boolean;
  index: number;
  peerLastReadAt: string | null;
}

export function MessageBubble({ message, mine, index, peerLastReadAt }: IMessageBubbleProps) {
  const read =
    mine &&
    Boolean(peerLastReadAt) &&
    new Date(message.createdAt).getTime() <= new Date(peerLastReadAt ?? '').getTime();
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
          <time dateTime={message.createdAt}>
            {new Date(message.createdAt).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}
          </time>
          {mine && (
            <span className={read ? 'message-read' : ''}>
              {read ? (
                <>
                  <Check size={10} />
                  읽음
                </>
              ) : (
                '전송됨'
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
