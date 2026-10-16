import { PostDetail } from '@/components/post-detail';
export default async function PostPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  return <PostDetail id={id} locale={locale} />;
}
