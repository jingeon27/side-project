'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { createConversation } from '@game-feedback/sdk';
import { MessageCircle, LoaderCircle } from 'lucide-react';
import { useSession } from './providers';
import type { Author } from '@/lib/api';
export function ChatLink({ author, locale }: { author: Author; locale: string }) {
  const { session, login, notify } = useSession(),
    router = useRouter(),
    client = useQueryClient(),
    [pending, setPending] = useState(false);
  if (session?.user?.id === author.id) return null;
  async function start() {
    if (!session?.user) {
      login();
      return;
    }
    setPending(true);
    try {
      const conversation = await createConversation({ recipientId: author.id });
      await client.invalidateQueries({ queryKey: ['chat', session.user.id, 'conversations'] });
      router.push(`/${locale}/messages?conversation=${encodeURIComponent(conversation.id)}`);
    } catch (error) {
      notify((error as Error).message || '대화를 시작하지 못했어요.');
    } finally {
      setPending(false);
    }
  }
  return (
    <button
      className="text-button chat-author-link"
      disabled={pending}
      onClick={start}
      aria-label={`${author.nickname}님과 채팅하기`}
    >
      {pending ? <LoaderCircle size={13} className="spin" /> : <MessageCircle size={13} />}채팅하기
    </button>
  );
}
