'use client';

import type { RefCallback } from 'react';

import { MessageCircle, RefreshCw, ShieldCheck } from 'lucide-react';

import { Spinner } from '@side/design-system';

import type { ChatMessage, Conversation } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { dateKey, formatDate } from '@/shared/lib/date';
import { AnimatePresence, m, useMotionPreference } from '@/shared/motion';

import { MessageBubble } from './MessageBubble';

interface IChatHistoryProps {
  conversation: Conversation;
  messages: ChatMessage[];
  userId: string;
  scroller: RefCallback<HTMLDivElement>;
  hasOlder: boolean;
  fetchingOlder: boolean;
  onScroll: () => void;
  onLoadOlder: () => void;
}

export function ChatHistory({
  conversation,
  messages,
  userId,
  scroller,
  hasOlder,
  fetchingOlder,
  onScroll,
  onLoadOlder,
}: IChatHistoryProps) {
  const { t, locale: textLocale } = useI18n();
  const reducedMotion = useMotionPreference();
  return (
    <div
      className="chat-message-scroll"
      ref={scroller}
      role="log"
      aria-label={t('대화 메시지')}
      aria-live="polite"
      aria-relevant="additions"
      onScroll={onScroll}
    >
      <div className="chat-message-list">
        {hasOlder && (
          <button className="chat-older" disabled={fetchingOlder} onClick={onLoadOlder}>
            {fetchingOlder ? <Spinner className="size-3" /> : <RefreshCw size={12} />}
            {t('이전 메시지 불러오기')}
          </button>
        )}
        {!hasOlder && (
          <div className="chat-beginning">
            <ShieldCheck size={14} />
            <span>{t('대화의 시작이에요. 먼저 가볍게 인사해보세요.')}</span>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const newDay = !previous || dateKey(previous.createdAt) !== dateKey(message.createdAt);
            return (
              <m.div
                key={message.id}
                initial={index === messages.length - 1 && !reducedMotion ? { opacity: 0.6, y: 6 } : false}
                animate={{ opacity: 1, y: 0 }}
              >
                {newDay && (
                  <div className="chat-date">
                    <span>
                      {formatDate(message.createdAt, textLocale, {
                        month: 'long',
                        day: 'numeric',
                        weekday: 'short',
                      })}
                    </span>
                  </div>
                )}
                <MessageBubble
                  message={message}
                  mine={message.sender.id === userId}
                  index={index}
                  peerLastReadAt={conversation.peerLastReadAt}
                />
              </m.div>
            );
          })}
        </AnimatePresence>
        {messages.length === 0 && (
          <div className="conversation-first-message">
            <MessageCircle size={33} />
            <strong>
              {conversation.peer.nickname}
              {t('님과 이야기를 시작해요')}
            </strong>
            <p>
              {t('어떤 플레이가 기억에 남았나요?')}
              <br />
              {t('먼저 반가운 인사를 건네보세요.')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
