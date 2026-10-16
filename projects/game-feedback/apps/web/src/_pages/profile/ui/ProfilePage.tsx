'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/features/auth';
import { profileOptions, UserBadges, AuthorLink } from '@/features/user';
import { userPostListOptions, PostCard } from '@/features/post';
import { Deck } from '@/features/game-profile';
import { StartChatLink } from '@/widgets/start-chat';
import type { PublicProfile, PostList } from '@/shared/api';
import { Avatar, ErrorNotice, LoadingState, ServiceErrorBoundary } from '@/shared/ui';
interface IProfilePageProps {
  id: string;
  locale: string;
  cursor?: string;
  initialProfile: PublicProfile;
  initialPosts: PostList;
  initialViewerId?: string;
}
export function ProfilePage({
  id,
  locale,
  cursor = '',
  initialProfile,
  initialPosts,
  initialViewerId,
}: IProfilePageProps) {
  const { session } = useSession();
  const sameViewer = session?.user?.id === initialViewerId;
  const profile = useQuery({ ...profileOptions(id), initialData: sameViewer ? initialProfile : undefined });
  const posts = useQuery({
    ...userPostListOptions(id, cursor),
    refetchOnMount: 'always',
    initialData: sameViewer ? initialPosts : undefined,
  });
  if (profile.isPending) return <LoadingState text="플레이어 프로필을 불러오고 있어요" />;
  if (profile.isError || !profile.data)
    return <ErrorNotice message={profile.error?.message || '플레이어를 찾을 수 없어요.'} />;
  const { author, joinedAt, postCount, answerCount, helpfulCount } = profile.data;
  return (
    <>
      <Link className="back-link" href={`/${locale}`}>
        ← 피드백 라운지
      </Link>
      <section className="settings-card public-profile" aria-label="플레이어 프로필">
        <div className="settings-profile">
          <Avatar name={author.nickname} size="large" />
          <div>
            <h1>{author.nickname}</h1>
            <UserBadges author={author} />
            <p>
              {new Date(joinedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}부터 함께 플레이 중
            </p>
          </div>
        </div>
        <p className="muted">클래시 로얄 플레이 경험을 나누는 플레이어</p>
        <dl className="public-profile-stats">
          <div>
            <dt>공개 요청</dt>
            <dd>{postCount}</dd>
          </div>
          <div>
            <dt>공개 답변</dt>
            <dd>{answerCount}</dd>
          </div>
          <div>
            <dt>도움됨</dt>
            <dd>{helpfulCount}</dd>
          </div>
        </dl>
        {author.supercellTag && (
          <p className="small muted">게임 계정 소유권 미인증 · 서비스 인증 표시와 별개입니다.</p>
        )}
        {author.id !== session?.user?.id && <StartChatLink userId={author.id} nickname={author.nickname} />}
      </section>
      <ServiceErrorBoundary title="작성한 피드백 요청" resetKey={`${id}:${cursor}`}>
        <section className="feed-section">
          <div className="section-title-row">
            <h2>작성한 피드백 요청</h2>
          </div>
          {posts.isPending && <LoadingState />}
          <ErrorNotice message={posts.error?.message} />
          {!posts.isError && posts.data?.items.length === 0 && (
            <p className="muted">공개한 피드백 요청이 없어요.</p>
          )}
          {!posts.isError && (
            <div className="post-list">
              {posts.data?.items.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  href={`/${locale}/posts/${post.id}`}
                  authorName={<AuthorLink author={post.author} locale={locale} />}
                  authorContent={<UserBadges author={post.author} compact />}
                  deck={post.gameProfile && <Deck profile={post.gameProfile} compact />}
                />
              ))}
            </div>
          )}
          <nav className="profile-pagination" aria-label="작성글 페이지">
            {cursor && <Link href={`/${locale}/users/${id}`}>처음으로</Link>}
            {posts.data?.nextCursor && (
              <Link href={`/${locale}/users/${id}?cursor=${encodeURIComponent(posts.data.nextCursor)}`}>
                이전 요청 보기 →
              </Link>
            )}
          </nav>
        </section>
      </ServiceErrorBoundary>
    </>
  );
}
