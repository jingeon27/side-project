import { getServerPost } from '@/features/post/index.server';
import { getServerSession } from '@/features/auth/index.server';
import { createPageMetadata, pageUrl, postStructuredData, JsonLd } from '@/shared/seo';
import { PostPage } from './ui/PostPage';
import { PostTopbar } from './ui/PostTopbar';
interface IPostRouteProps {
  params: Promise<{ locale: string; id: string }>;
}
export async function postMetadata({ params }: IPostRouteProps) {
  const { locale, id } = await params;
  const { post } = await getServerPost(id);
  return createPageMetadata({
    title: post.title,
    description: post.body,
    path: `/${locale}/posts/${encodeURIComponent(id)}`,
    type: 'article',
    keywords: [post.category.name, post.author.nickname, '플레이 피드백'],
    publishedTime: post.createdAt,
    modifiedTime: post.updatedAt,
    authorName: post.author.nickname,
    authorUrl: pageUrl(`/${locale}/users/${encodeURIComponent(post.author.id)}`),
    isTestAccount: post.author.isTestAccount,
  });
}
export async function PostRoute({ params }: IPostRouteProps) {
  const { locale, id } = await params;
  const [initialDetail, session] = await Promise.all([getServerPost(id), getServerSession()]);
  return (
    <>
      <JsonLd data={postStructuredData(initialDetail)} />
      <PostPage id={id} locale={locale} initialDetail={initialDetail} initialViewerId={session.user?.id} />
    </>
  );
}

export async function PostHeaderRoute({ params }: IPostRouteProps) {
  const { locale, id } = await params;
  const { post } = await getServerPost(id);
  return <PostTopbar locale={locale} post={post} />;
}
