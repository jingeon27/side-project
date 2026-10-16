'use client';
import { useI18n } from '@/shared/i18n';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/features/auth';
import { profileOptions, UserBadges, AuthorLink } from '@/features/user';
import { userPostListOptions, PostCard } from '@/features/post';
import { Deck } from '@/features/game-profile';
import { StartChatLink } from '@/widgets/start-chat';
import type { PublicProfile, PostList } from '@/shared/api';
import { Avatar, ErrorNotice, LoadingState, ServiceErrorBoundary } from '@/shared/ui';
import { BackLink } from '@/shared/navigation';
import { appRoutes } from '@game-feedback/bridge';
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
  const { t, locale: textLocale } = useI18n();
  const { session } = useSession();
  const sameViewer = session?.user?.id === initialViewerId;
  const profile = useQuery({ ...profileOptions(id), initialData: sameViewer ? initialProfile : undefined });
  const posts = useQuery({
    ...userPostListOptions(id, cursor),
    refetchOnMount: 'always',
    initialData: sameViewer ? initialPosts : undefined,
  });
  if (profile.isPending) return <LoadingState text={t('플레이어 프로필을 불러오고 있어요')} />;
  if (profile.isError || !profile.data)
    return <ErrorNotice message={profile.error?.message || t('플레이어를 찾을 수 없어요.')} />;
  const { author, joinedAt, postCount, answerCount, helpfulCount } = profile.data;
  return (
    <>
      <BackLink className="back-link" href={appRoutes.feed(locale)}>
        {t('← 피드백 라운지')}
      </BackLink>
      <section className="settings-card public-profile" aria-label={t('플레이어 프로필')}>
        <div className="settings-profile">
          <Avatar name={author.nickname} size="large" />
          <div>
            <h1>{author.nickname}</h1>
            <UserBadges author={author} />
            <p>
              {t('{date}부터 함께 플레이 중', {
                date: new Date(joinedAt).toLocaleDateString(textLocale, { timeZone: 'Asia/Seoul' }),
              })}
            </p>
          </div>
        </div>
        <p className="muted">{t('클래시 로얄 플레이 경험을 나누는 플레이어')}</p>
        <dl className="public-profile-stats">
          <div>
            <dt>{t('공개 요청')}</dt>
            <dd>{postCount}</dd>
          </div>
          <div>
            <dt>{t('공개 답변')}</dt>
            <dd>{answerCount}</dd>
          </div>
          <div>
            <dt>{t('도움됨')}</dt>
            <dd>{helpfulCount}</dd>
          </div>
        </dl>
        {author.supercellTag && (
          <p className="small muted">
            {t('게임 계정 소유권은 인증되지 않았습니다. 서비스 인증 표시와는 별개입니다.')}
          </p>
        )}
        {author.id !== session?.user?.id && <StartChatLink userId={author.id} nickname={author.nickname} />}
      </section>
      <ServiceErrorBoundary title={t('작성한 피드백 요청')} resetKey={`${id}:${cursor}`}>
        <section className="feed-section">
          <div className="section-title-row">
            <h2>{t('작성한 피드백 요청')}</h2>
          </div>
          {posts.isPending && <LoadingState />}
          <ErrorNotice message={posts.error?.message} />
          {!posts.isError && posts.data?.items.length === 0 && (
            <p className="muted">{t('공개한 피드백 요청이 없어요.')}</p>
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
          <nav className="profile-pagination" aria-label={t('작성글 페이지')}>
            {cursor && <Link href={`/${locale}/users/${id}`}>{t('처음으로')}</Link>}
            {posts.data?.nextCursor && (
              <Link href={`/${locale}/users/${id}?cursor=${encodeURIComponent(posts.data.nextCursor)}`}>
                {t('이전 요청 보기 →')}
              </Link>
            )}
          </nav>
        </section>
      </ServiceErrorBoundary>
    </>
  );
}
