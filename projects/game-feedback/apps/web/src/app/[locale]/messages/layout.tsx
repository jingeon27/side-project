import { Suspense, type ReactNode } from 'react';
import { locale as rootLocale } from 'next/root-params';

import { MessagesLayout } from '@/_pages/messages';
import { LoadingState } from '@/shared/ui';

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
