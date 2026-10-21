import { Suspense } from 'react';
import { notFound } from 'next/navigation';

import { appRoutes, RouteIdSchema } from '@game-feedback/bridge';

import { createPageMetadata } from '@/shared/seo';
import { LoadingState } from '@/shared/ui';

interface IConversationRouteProps {
  params: Promise<{ locale: string; conversationId: string }>;
}
async function RouteContent({ params }: IConversationRouteProps) {
  if (!RouteIdSchema.safeParse((await params).conversationId).success) notFound();
  return null;
}
export async function generateMetadata({ params }: IConversationRouteProps) {
  const { locale, conversationId } = await params;
  if (!RouteIdSchema.safeParse(conversationId).success) notFound();
  return createPageMetadata({
    title: '1:1 플레이어 대화',
    description: '플레이어와 나누는 비공개 대화입니다.',
    path: appRoutes.conversation(locale, conversationId),
    privatePage: true,
    keywords: ['1:1 채팅'],
  });
}

export default function Page(props: Parameters<typeof RouteContent>[0]) {
  return (
    <Suspense fallback={<LoadingState />}>
      <RouteContent {...props} />
    </Suspense>
  );
}
