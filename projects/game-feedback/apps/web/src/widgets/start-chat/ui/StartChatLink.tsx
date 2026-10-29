'use client';

import { useParams, useRouter } from 'next/navigation';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';

import { appRoutes } from '@game-feedback/bridge';
import { Button, type IButtonProps } from '@side/design-system';

import { useSession } from '@/features/auth';
import { chatError, createConversationMutationOptions } from '@/features/chat';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/analytics';
import { useI18n } from '@/shared/i18n';
import { useNotify } from '@/shared/ui';

interface IStartChatLinkProps {
  source: 'post' | 'comment' | 'profile';
  userId: string;
  nickname: string;
  label?: string;
  variant?: IButtonProps['variant'];
  size?: IButtonProps['size'];
}

export function StartChatLink({
  source,
  userId,
  nickname,
  label,
  variant = 'ghost',
  size = 'sm',
}: IStartChatLinkProps) {
  const client = useQueryClient();
  const { t } = useI18n();
  const { session, requireLogin } = useSession();
  const notify = useNotify();
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const mutation = useMutation(createConversationMutationOptions(client, session?.user?.id));

  const handleStart = () => {
    if (!session?.user) {
      requireLogin();
      return;
    }
    mutation.mutate(userId, {
      onSuccess: (conversation) => {
        trackEvent(ANALYTICS_EVENT.ChatStarted, { source });
        router.push(appRoutes.conversation(locale, conversation.id));
      },
      onError: (error) => notify(t(chatError(error))),
    });
  };

  if (session?.user?.id === userId) return null;
  const text = label ?? t('채팅하기');
  return (
    <Button
      type="button"
      onClick={handleStart}
      aria-label={label ? `${nickname} ${label}` : t('{name}님과 채팅하기', { name: nickname })}
      className="chat-author-link"
      variant={variant}
      size={size}
      loading={mutation.isPending}
      icon={<MessageCircle size={13} aria-hidden />}
    >
      {text}
    </Button>
  );
}
