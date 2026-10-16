import { MessagesPage as MessagesScreen } from '@/_pages/messages';
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
  return <MessagesScreen locale={locale} conversationId={conversationId} />;
}
