import { Suspense, type ReactNode } from 'react';

import { getServerSession } from '@/features/auth/index.server';
import { getServerPost } from '@/features/post/index.server';
import { createPageMetadata, JsonLd, pageUrl, postStructuredData } from '@/shared/seo';
import { CommunityPage } from '@/widgets/community-shell';

import { PostPage } from './ui/PostPage';
import { PostTopbar } from './ui/PostTopbar';
import { PostTopbarPlaceholder } from './ui/PostTopbarPlaceholder';

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

async function PostHeaderRoute({ params }: IPostRouteProps) {
  const { locale, id } = await params;
  const { post } = await getServerPost(id);
  return <PostTopbar locale={locale} post={post} />;
}

export function PostDocument({
  locale,
  params,
  streamHeader,
  children,
}: {
  locale: string;
  params: Promise<{ locale: string; id: string }>;
  streamHeader: boolean;
  children: ReactNode;
}) {
  const header = <PostHeaderRoute params={params} />;
  return (
    <CommunityPage
      locale={locale}
      topbar={
        streamHeader ? (
          <Suspense fallback={<PostTopbarPlaceholder locale={locale} />}>{header}</Suspense>
        ) : (
          header
        )
      }
    >
      {children}
    </CommunityPage>
  );
}
