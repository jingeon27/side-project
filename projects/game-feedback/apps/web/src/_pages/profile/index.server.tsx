import { notFound } from 'next/navigation';
import { getServerProfile } from '@/features/user/index.server';
import { getServerUserPosts } from '@/features/post/index.server';
import { getServerSession } from '@/features/auth/index.server';
import { createPageMetadata, profileDescription, profileStructuredData, JsonLd } from '@/shared/seo';
import { ProfilePage } from './ui/ProfilePage';
interface IProfileRouteProps {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ cursor?: string | string[] }>;
}
export async function profileMetadata({ params, searchParams }: IProfileRouteProps) {
  const { locale, id } = await params;
  const profile = await getServerProfile(id);
  const { cursor } = await searchParams;
  return createPageMetadata({
    title: `${profile.author.nickname} 플레이어 프로필`,
    description: profileDescription(profile),
    path: `/${locale}/users/${encodeURIComponent(id)}${typeof cursor === 'string' ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    keywords: [profile.author.nickname, '플레이어 프로필', '작성한 피드백'],
    type: 'profile',
    authorName: profile.author.nickname,
    isTestAccount: profile.author.isTestAccount,
  });
}
export async function ProfileRoute({ params, searchParams }: IProfileRouteProps) {
  const { locale, id } = await params;
  const query = await searchParams;
  if (query.cursor !== undefined && (typeof query.cursor !== 'string' || query.cursor.length > 200))
    notFound();
  const initialProfile = await getServerProfile(id);
  const [initialPosts, session] = await Promise.all([
    getServerUserPosts(id, query.cursor),
    getServerSession(),
  ]);
  return (
    <>
      <JsonLd data={profileStructuredData(initialProfile, query.cursor)} />
      <ProfilePage
        id={id}
        locale={locale}
        cursor={query.cursor}
        initialProfile={initialProfile}
        initialPosts={initialPosts}
        initialViewerId={session.user?.id}
      />
    </>
  );
}
