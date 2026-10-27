'use client';

import Link from 'next/link';

import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';

import { appRoutes } from '@game-feedback/bridge';
import { Button } from '@side/design-system';

import { useSession } from '@/features/auth';
import { FollowControls } from '@/features/follow';
import { PostCard, userPostListOptions } from '@/features/post';
import { AuthorLink, ProfileEditSheet, profileOptions, UserBadges } from '@/features/user';
import type { PostList, PublicProfile } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { formatDate } from '@/shared/lib/date';
import { BackLink } from '@/shared/navigation';
import { Avatar, LinkifiedText, LoadingState, openOverlay, ServiceErrorBoundary } from '@/shared/ui';
import { ReportUserButton } from '@/widgets/moderation';
import { StartChatLink } from '@/widgets/start-chat';

interface IProfilePageProps {
  id: string;
  locale: string;
  cursor?: string;
  initialProfile: PublicProfile;
  initialPosts: PostList;
  initialViewerId?: string;
}
function openProfileEdit(profile: PublicProfile) {
  openOverlay((control) => <ProfileEditSheet {...control} profile={profile} />);
}
export function ProfilePage(props: IProfilePageProps) {
  const { t } = useI18n();
  const { session } = useSession();
  return (
    <ServiceErrorBoundary
      title={t('플레이어 프로필')}
      resetKey={`${props.id}:${session.user?.id ?? 'anonymous'}`}
      recoveryAction={<BackLink href={appRoutes.feed(props.locale)}>{t('← 피드')}</BackLink>}
    >
      <ProfileContent {...props} />
    </ServiceErrorBoundary>
  );
}
function ProfileContent({
  id,
  locale,
  cursor = '',
  initialProfile,
  initialPosts,
  initialViewerId,
}: IProfilePageProps) {
  const { t, locale: textLocale } = useI18n();
  const { session, requireLogin } = useSession();
  const sameViewer = session?.user?.id === initialViewerId;
  const profile = useQuery({
    ...profileOptions(id),
    throwOnError: true,
    refetchOnMount: 'always',
    initialData: sameViewer ? initialProfile : undefined,
  });
  if (!profile.data) return <LoadingState text={t('플레이어 프로필을 불러오고 있어요')} />;
  const { links, bio, author, joinedAt, postCount, answerCount, helpfulCount } = profile.data;
  return (
    <>
      <BackLink className="back-link" href={appRoutes.feed(locale)}>
        {t('← 피드')}
      </BackLink>
      <section className="settings-card public-profile" aria-label={t('플레이어 프로필')}>
        <div className="settings-profile">
          <Avatar src={author.avatarUrl} name={author.nickname} size="large" />
          <div>
            <h1>{author.nickname}</h1>
            <UserBadges author={author} />
            <p>
              {t('{date}부터 함께 플레이 중', {
                date: formatDate(joinedAt, textLocale),
              })}
            </p>
          </div>
          {author.id === session.user?.id && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="profile-edit-trigger"
              onClick={() => openProfileEdit(profile.data)}
            >
              <Pencil size={15} aria-hidden />
              {t('프로필 수정')}
            </Button>
          )}
        </div>
        {bio && <LinkifiedText text={bio} className="profile-bio" />}
        {(links ?? []).length > 0 && (
          <ul className="profile-links" aria-label={t('프로필 링크')}>
            {(links ?? []).map((link) => (
              <li key={`${link.url}:${link.label}`}>
                <a href={link.url} target="_blank" rel="nofollow ugc noopener noreferrer">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        )}
        {!bio && <p className="muted">{t('클래시 로얄 플레이 경험을 나누는 플레이어')}</p>}
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
        {author.id !== session?.user?.id && (
          <StartChatLink source="profile" userId={author.id} nickname={author.nickname} />
        )}
        <FollowControls userId={author.id} viewerId={session.user?.id} onLogin={() => requireLogin()} />
        <ReportUserButton userId={author.id} />
      </section>
      <ServiceErrorBoundary title={t('작성한 게시글')} resetKey={`${id}:${cursor}`}>
        <ProfilePosts
          id={id}
          locale={locale}
          cursor={cursor}
          initialPosts={initialPosts}
          initialViewerId={initialViewerId}
        />
      </ServiceErrorBoundary>
    </>
  );
}

function ProfilePosts({
  id,
  locale,
  cursor = '',
  initialPosts,
  initialViewerId,
}: Omit<IProfilePageProps, 'initialProfile'>) {
  const { t } = useI18n();
  const { session } = useSession();
  const sameViewer = session.user?.id === initialViewerId;
  const posts = useQuery({
    ...userPostListOptions(id, cursor),
    throwOnError: true,
    refetchOnMount: 'always',
    initialData: sameViewer ? initialPosts : undefined,
  });
  if (!posts.data) return <LoadingState />;
  return (
    <section className="feed-section">
      <div className="section-title-row">
        <h2>{t('작성한 게시글')}</h2>
      </div>
      {posts.data.items.length === 0 && <p className="muted">{t('공개한 게시글이 없어요.')}</p>}
      <div className="post-list">
        {posts.data.items.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            href={appRoutes.post(locale, post.id, post.board, post.category.slug)}
            authorName={<AuthorLink author={post.author} locale={locale} />}
            authorContent={<UserBadges author={post.author} compact />}
          />
        ))}
      </div>
      <nav className="profile-pagination" aria-label={t('작성글 페이지')}>
        {cursor && <Link href={appRoutes.profile(locale, id)}>{t('처음으로')}</Link>}
        {posts.data?.nextCursor && (
          <Link href={appRoutes.profile(locale, id, posts.data.nextCursor)}>{t('이전 글 보기 →')}</Link>
        )}
      </nav>
    </section>
  );
}
