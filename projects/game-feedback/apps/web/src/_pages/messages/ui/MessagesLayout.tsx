'use client';

import type { ReactNode } from 'react';
import { useParams } from 'next/navigation';

import { RouteIdSchema } from '@game-feedback/bridge';

import { CommunityPage } from '@/widgets/community-shell';

import { ConversationTopbar } from './conversation/ConversationTopbar';
import { MessagesTopbar } from './list/MessagesTopbar';
import { MessagesPage } from './MessagesPage';

export function MessagesLayout({ locale, children }: { locale: string; children: ReactNode }) {
  const { conversationId } = useParams<{ conversationId?: string }>();
  if (conversationId && !RouteIdSchema.safeParse(conversationId).success) return children;
  return (
    <CommunityPage
      locale={locale}
      topbar={conversationId ? <ConversationTopbar locale={locale} /> : <MessagesTopbar locale={locale} />}
    >
      <MessagesPage locale={locale} conversationId={conversationId} />
      {children}
    </CommunityPage>
  );
}
