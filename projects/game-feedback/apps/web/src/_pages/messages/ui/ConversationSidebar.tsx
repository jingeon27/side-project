'use client';

import Link from 'next/link';

import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { ArrowUpRight, MessageCircle } from 'lucide-react';

import { appRoutes } from '@game-feedback/bridge';

import { conversationListOptions } from '@/features/chat';
import { useI18n } from '@/shared/i18n';
import { useChatConnection } from '@/widgets/chat-realtime';

import { ConversationRow } from './ConversationRow';

interface IConversationSidebarProps {
  userId: string;
  conversationId?: string;
  locale: string;
}

export function ConversationSidebar({ userId, conversationId, locale }: IConversationSidebarProps) {
  const { t } = useI18n();
  const connection = useChatConnection();
  const conversations = useSuspenseInfiniteQuery({
    ...conversationListOptions(userId),
    refetchInterval: connection === 'live' ? false : 10_000,
  });
  const items = conversations.data.pages.flatMap((page) => page.items) ?? [];
  const unread = conversations.data.pages[0]?.unreadCount ?? 0;
  if (conversations.error && !conversations.isFetching) throw conversations.error;
  return (
    <aside className="conversation-sidebar" aria-label={t('내 대화 목록')}>
      <div className="conversation-list-heading">
        <h2>{t('내 메시지')}</h2>
        {unread > 0 && (
          <span className="chat-unread-total" aria-label={t('읽지 않은 메시지 {count}개', { count: unread })}>
            {unread}
          </span>
        )}
      </div>
      <div className="conversation-list">
        {items.map((item) => (
          <ConversationRow
            key={item.id}
            conversation={item}
            selected={conversationId === item.id}
            replace={Boolean(conversationId)}
            locale={locale}
          />
        ))}
      </div>
      {items.length === 0 && (
        <div className="chat-empty-list">
          <MessageCircle size={27} />
          <strong>{t('아직 시작한 대화가 없어요')}</strong>
          <p>
            {t('피드의 요청이나 답변에서')}
            <br />
            {t('‘채팅하기’를 눌러보세요.')}
          </p>
          <Link href={appRoutes.feed(locale)}>
            {t('플레이어 만나러 가기')}
            <ArrowUpRight size={13} />
          </Link>
        </div>
      )}
      {conversations.hasNextPage && (
        <button
          className="conversation-more"
          disabled={conversations.isFetchingNextPage}
          onClick={() => conversations.fetchNextPage()}
        >
          {conversations.isFetchingNextPage ? t('불러오는 중…') : t('이전 대화 더 보기')}
        </button>
      )}
    </aside>
  );
}
