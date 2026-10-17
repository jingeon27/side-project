'use client';
import { useI18n } from '@/shared/i18n';
import { Button } from '@side/design-system';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ShieldBan } from 'lucide-react';
import { chatMessageOptions } from '@/features/chat';
import { UserBadges } from '@/features/user';
import { Avatar } from '@/shared/ui';
import { useChatConnection } from '@/widgets/chat-realtime';
import { useChatBlock } from '../model/use-chat-block';
import { useChatScroll } from '../model/use-chat-scroll';
import { useVisibleRead } from '../model/use-visible-read';
import { ChatComposer } from './ChatComposer';
import { ChatHistory } from './ChatHistory';
import { BackLink } from '@/shared/navigation';
import { appRoutes } from '@game-feedback/bridge';

interface IConversationPaneProps {
  conversationId: string;
  userId: string;
  locale: string;
}

export function ConversationPane({ conversationId, userId, locale }: IConversationPaneProps) {
  const { t } = useI18n();
  const connection = useChatConnection();
  const query = useSuspenseInfiniteQuery({
    ...chatMessageOptions(userId, conversationId),
    refetchInterval: connection === 'live' ? false : 10_000,
  });
  const conversation = query.data.pages[0]?.conversation;
  const newestFirst = query.data.pages.flatMap((page) => page.items) ?? [];
  const messages = [...new Map(newestFirst.map((message) => [message.id, message])).values()].reverse();
  const unavailable = query.isError || !conversation;
  const scroll = useChatScroll({
    messageStamp: messages.map((message) => message.id).join(','),
    newestId: newestFirst[0]?.id ?? '',
    pending: query.isPending,
    unavailable,
    fetchingOlder: query.isFetchingNextPage,
  });
  const read = useVisibleRead({
    userId,
    conversationId,
    visibleBoundary: scroll.visibleBoundary,
    unavailable,
  });
  const { handleBlock } = useChatBlock({ userId, conversationId, locale });

  function handleLoadOlder() {
    scroll.handleCaptureHistory();
    void query.fetchNextPage();
  }

  if (query.error && !query.isFetching) throw query.error;
  if (!conversation) throw new Error('Conversation is unavailable.');
  return (
    <section
      className="conversation-pane"
      aria-label={t('{name}님과의 대화', { name: conversation.peer.nickname })}
    >
      <header className="conversation-heading">
        <BackLink
          href={appRoutes.messages(locale)}
          parentOnly
          scroll={false}
          className="icon-button chat-back"
          aria-label={t('대화 목록으로 돌아가기')}
        >
          <ArrowLeft size={19} />
        </BackLink>
        <Avatar name={conversation.peer.nickname} size="small" />
        <div>
          <h2>{conversation.peer.nickname}</h2>
          {(conversation.peer.isVerified ||
            conversation.peer.isTestAccount ||
            conversation.peer.supercellTag ||
            conversation.supportTopic) && (
            <div className="conversation-peer-meta">
              <UserBadges author={conversation.peer} compact />
              {conversation.supportTopic && (
                <span>
                  {t(conversation.supportTopic === 'VERIFICATION' ? '프로필 인증 문의' : '관리자 문의')}
                </span>
              )}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          aria-label={t('차단')}
          title={t('차단')}
          onClick={() => handleBlock(conversation.peer)}
        >
          <ShieldBan size={18} />
        </Button>
      </header>
      <ChatHistory
        conversation={conversation}
        messages={messages}
        userId={userId}
        scroller={scroll.scroller}
        hasOlder={query.hasNextPage}
        fetchingOlder={query.isFetchingNextPage}
        onScroll={scroll.handleScroll}
        onLoadOlder={handleLoadOlder}
      />
      <div className="chat-compose-dock">
        {scroll.unseen && (
          <button className="chat-new-messages" onClick={scroll.handleScrollLatest}>
            {t('새 메시지가 도착했어요')}
            <ArrowDown size={14} />
          </button>
        )}
        <ChatComposer
          userId={userId}
          conversationId={conversationId}
          unavailable={unavailable}
          readFailed={read.mutation.isError}
          onRetryRead={read.handleRetryRead}
          onSent={scroll.handleSent}
          onUnavailable={() => query.refetch()}
        />
      </div>
    </section>
  );
}
