import { notFound } from 'next/navigation';
import { appRoutes, RouteIdSchema } from '@game-feedback/bridge';
import { createPageMetadata } from '@/shared/seo';

interface IConversationRouteProps {
  params: Promise<{ locale: string; conversationId: string }>;
}
export default async function Page({ params }: IConversationRouteProps) {
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
