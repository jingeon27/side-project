'use client';

import type { ReactNode } from 'react';
import { useParams } from 'next/navigation';

import { RouteIdSchema } from '@game-feedback/bridge';

import { CommunityPage } from '@/widgets/community-shell';

import { ConversationTopbar } from './ConversationTopbar';
import { MessagesPage } from './MessagesPage';
import { MessagesTopbar } from './MessagesTopbar';

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
