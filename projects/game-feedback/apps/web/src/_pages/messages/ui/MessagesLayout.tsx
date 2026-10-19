'use client';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { RouteIdSchema } from '@game-feedback/bridge';
import { MessagesPage } from './MessagesPage';

export function MessagesLayout({ locale, children }: { locale: string; children: ReactNode }) {
  const { conversationId } = useParams<{ conversationId?: string }>();
  if (conversationId && !RouteIdSchema.safeParse(conversationId).success) return children;
  return (
    <>
      <MessagesPage locale={locale} conversationId={conversationId} />
      {children}
    </>
  );
}
