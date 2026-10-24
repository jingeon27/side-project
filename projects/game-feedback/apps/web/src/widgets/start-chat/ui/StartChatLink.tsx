'use client';

import { useParams, useRouter } from 'next/navigation';

import { LoaderCircle, MessageCircle } from 'lucide-react';

import { appRoutes } from '@game-feedback/bridge';
import { Button } from '@side/design-system';

import { useSession } from '@/features/auth';
import { chatError, useCreateConversationMutation } from '@/features/chat';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/analytics';
import { useI18n } from '@/shared/i18n';

interface IStartChatLinkProps {
  source: 'post' | 'comment' | 'profile';
  userId: string;
  nickname: string;
  label?: string;
  appearance?: 'text' | 'button';
}

export function StartChatLink({ source, userId, nickname, label, appearance = 'text' }: IStartChatLinkProps) {
  const { t } = useI18n();
  const { session, login, notify } = useSession();
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const mutation = useCreateConversationMutation(session?.user?.id);

  function handleStart() {
    if (!session?.user) {
      login();
      return;
    }
    mutation.mutate(userId, {
      onSuccess: (conversation) => {
        trackEvent(ANALYTICS_EVENT.ChatStarted, { source });
        router.push(appRoutes.conversation(locale, conversation.id));
      },
      onError: (error) => notify(chatError(error)),
    });
  }

  if (session?.user?.id === userId) return null;
  const content = (
    <>
      {mutation.isPending ? <LoaderCircle size={13} className="spin" /> : <MessageCircle size={13} />}
      {label ?? t('채팅하기')}
    </>
  );
  const controlProps = {
    type: 'button' as const,
    disabled: mutation.isPending,
    onClick: handleStart,
    'aria-label': label ? `${nickname} ${label}` : `${nickname}님과 채팅하기`,
  };
  if (appearance === 'button')
    return (
      <Button {...controlProps} className="chat-author-link" variant="accent" size="md">
        {content}
      </Button>
    );
  return (
    <button {...controlProps} className="text-action chat-author-link">
      {content}
    </button>
  );
}
