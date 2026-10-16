import { ChatScreen } from '@/components/chat';
export default async function MessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ conversation?: string | string[] }>;
}) {
  const { locale } = await params,
    query = await searchParams;
  const conversationId = typeof query.conversation === 'string' ? query.conversation : undefined;
  return <ChatScreen locale={locale} conversationId={conversationId} />;
}
