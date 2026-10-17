import { Suspense, type ReactNode } from 'react';
import { locale as rootLocale } from 'next/root-params';
import { LoadingState } from '@/shared/ui';
import { MessagesLayout } from '@/_pages/messages';

export default async function Layout({
  children,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  return (
    <Suspense fallback={<LoadingState />}>
      <MessagesLayout locale={await rootLocale()}>{children}</MessagesLayout>
    </Suspense>
  );
}
