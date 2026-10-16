import { PostPage as PostScreen } from '@/_pages/post';
export default async function PostPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  return <PostScreen id={id} locale={locale} />;
}
