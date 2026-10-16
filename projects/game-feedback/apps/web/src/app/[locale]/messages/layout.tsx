import type { ReactNode } from 'react';
import { MessagesLayout } from '@/_pages/messages';

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  return <MessagesLayout locale={(await params).locale}>{children}</MessagesLayout>;
}
