'use client';
import { useParams, useRouter } from 'next/navigation';
import { LoaderCircle, MessageCircle } from 'lucide-react';
import { useSession } from '@/features/auth';
import { chatError, useCreateConversationMutation } from '@/features/chat';

interface IStartChatLinkProps {
  userId: string;
  nickname: string;
}

export function StartChatLink({ userId, nickname }: IStartChatLinkProps) {
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
        router.push(`/${locale}/messages?conversation=${encodeURIComponent(conversation.id)}`);
      },
      onError: (error) => notify(chatError(error)),
    });
  }

  if (session?.user?.id === userId) return null;
  return (
    <button
      className="text-button chat-author-link"
      disabled={mutation.isPending}
      onClick={handleStart}
      aria-label={`${nickname}님과 채팅하기`}
    >
      {mutation.isPending ? <LoaderCircle size={13} className="spin" /> : <MessageCircle size={13} />}
      채팅하기
    </button>
  );
}
