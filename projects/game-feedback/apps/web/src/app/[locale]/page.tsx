import { Feed } from '@/components/feed';
export default async function FeedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <Feed locale={locale} />;
}
