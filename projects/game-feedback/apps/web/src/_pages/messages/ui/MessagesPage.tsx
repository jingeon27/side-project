'use client';

import Link from 'next/link';

import { ArrowUpRight, MessageCircle } from 'lucide-react';

import { appRoutes } from '@game-feedback/bridge';
import { Button } from '@side/design-system';

import { useSession } from '@/features/auth';
import { useI18n } from '@/shared/i18n';
import { AsyncBoundary, LoadingState } from '@/shared/ui';

import { ChatConnectionStatus } from './ChatConnectionStatus';
import { ChatWelcome } from './ChatWelcome';
import { ConversationPane } from './ConversationPane';
import { ConversationSidebar } from './ConversationSidebar';

interface IMessagesPageProps {
  locale: string;
  conversationId?: string;
}

export function MessagesPage({ locale, conversationId }: IMessagesPageProps) {
  const { t } = useI18n();
  const { session, loading, login } = useSession();
  const userId = session?.user?.id;
  if (loading) return <LoadingState text={t('메시지 공간을 준비하고 있어요')} />;
  if (!userId)
    return (
      <div className="empty-feed">
        <span>
          <MessageCircle size={30} />
        </span>
        <h1>{t('플레이 이야기를, 조금 더 가까이')}</h1>
        <p>{t('로그인하면 다른 플레이어와 1:1 메시지를 나눌 수 있어요.')}</p>
        <Button variant="primary" size="md" type="submit" className="button dark" onClick={() => login()}>
          {t('로그인하고 대화하기')}
          <ArrowUpRight size={16} />
        </Button>
      </div>
    );
  return (
    <>
      <div className="page-heading chat-page-heading">
        <div>
          <h1>{t('채팅')}</h1>
        </div>
        <ChatConnectionStatus />
      </div>
      <div className={`chat-workspace ${conversationId ? 'has-conversation' : ''}`}>
        <AsyncBoundary
          clientOnly
          title={t('대화 목록')}
          resetKey={userId}
          fallbackClassName="conversation-sidebar"
          pendingFallback={
            <aside className="conversation-sidebar">
              <LoadingState text={t('대화를 불러오고 있어요')} />
            </aside>
          }
        >
          <ConversationSidebar userId={userId} conversationId={conversationId} locale={locale} />
        </AsyncBoundary>
        {conversationId ? (
          <AsyncBoundary
            clientOnly
            title={t('대화창')}
            resetKey={`${userId}:${conversationId}`}
            fallbackClassName="conversation-pane"
            pendingFallback={
              <section className="conversation-pane">
                <LoadingState text={t('메시지를 불러오고 있어요')} />
              </section>
            }
            recoveryAction={
              <Link href={appRoutes.messages(locale)} replace scroll={false} className="text-button">
                {t('대화 목록으로 돌아가기 →')}
              </Link>
            }
          >
            <ConversationPane
              key={`${userId}:${conversationId}`}
              conversationId={conversationId}
              userId={userId}
              locale={locale}
            />
          </AsyncBoundary>
        ) : (
          <ChatWelcome locale={locale} />
        )}
      </div>
    </>
  );
}
