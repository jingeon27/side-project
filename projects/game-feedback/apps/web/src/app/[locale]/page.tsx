import { FeedPage as FeedScreen } from '@/_pages/feed';
export default async function FeedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <FeedScreen locale={locale} />;
}
