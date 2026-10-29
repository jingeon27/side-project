'use client';

import { use, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowUpRight, MessageSquare, Plus } from 'lucide-react';
import { match, P } from 'ts-pattern';

import { appRoutes } from '@game-feedback/bridge';
import { Button } from '@side/design-system';

import { useSession } from '@/features/auth';
import { PostCard, postListOptions, PostListSkeleton } from '@/features/post';
import { AuthorLink, UserBadges } from '@/features/user';
import { useI18n } from '@/shared/i18n';
import { useBrowserSearch } from '@/shared/navigation';
import { AsyncBoundary, ServiceErrorBoundary } from '@/shared/ui';
import { CommunityPage } from '@/widgets/community-shell';

import { feedSnapshotSearch } from '../model/feed-snapshot-search';
import type { IFeedSnapshot } from '../model/feed-snapshot.type';
import { FeedFilters } from './FeedFilters';
import { FeedTopbar } from './FeedTopbar';

function FeedContent({
  locale,
  initialFeed,
}: {
  locale: string;
  initialFeed: IFeedSnapshot | Promise<IFeedSnapshot>;
}) {
  const { t } = useI18n();
  const { session, requireLogin } = useSession();
  const router = useRouter();
  const handleCompose = () => {
    if (!session?.user) {
      requireLogin();
      return;
    }
    router.push(appRoutes.compose(locale));
  };

  return (
    <section className="feed-section">
      <FeedFilters onCompose={handleCompose} />
      <AsyncBoundary
        title={t('최신 글')}
        resetKey={session.user?.id}
        refreshOnRetry
        suspense={'then' in initialFeed}
        pendingFallback={<PostListSkeleton />}
      >
        <FeedResultsRegion locale={locale} initialFeed={initialFeed} onCompose={handleCompose} />
      </AsyncBoundary>
    </section>
  );
}

function FeedResultsRegion({
  locale,
  initialFeed,
  onCompose,
}: {
  locale: string;
  initialFeed: IFeedSnapshot | Promise<IFeedSnapshot>;
  onCompose: () => void;
}) {
  const { t } = useI18n();
  const { session } = useSession();
  const initial = 'then' in initialFeed ? use(initialFeed) : initialFeed;
  const search = useBrowserSearch(feedSnapshotSearch(initial), appRoutes.feed(locale));
  const params = new URLSearchParams(search);
  const tab = params.get('tab') === 'unanswered' ? 'unanswered' : 'latest';
  const q = params.get('q')?.trim().slice(0, 100) ?? '';
  return (
    <ServiceErrorBoundary title={t('최신 글')} resetKey={`${session.user?.id ?? 'anonymous'}:${tab}:${q}`}>
      <FeedResults locale={locale} tab={tab} q={q} initial={initial} onCompose={onCompose} />
    </ServiceErrorBoundary>
  );
}
function FeedResults({
  locale,
  tab,
  q,
  initial,
  onCompose: handleCompose,
}: {
  locale: string;
  tab: 'latest' | 'unanswered';
  q: string;
  initial: IFeedSnapshot;
  onCompose: () => void;
}) {
  const { t } = useI18n();
  const { session } = useSession();
  const sameQuery = initial.q === q && initial.tab === tab && initial.viewerId === session.user?.id;
  const feed = useInfiniteQuery({
    throwOnError: true,
    ...postListOptions({
      limit: 8,
      board: tab === 'unanswered' ? 'FEEDBACK' : 'ALL',
      ...(tab === 'unanswered' ? { unanswered: 'true' } : {}),
      ...(q ? { q } : {}),
    }),
    ...(sameQuery
      ? { initialData: { pages: [initial.posts], pageParams: [''] }, initialDataUpdatedAt: 0 }
      : {}),
  });
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = feed;
  const sentinel = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !hasNextPage) return;
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
        },
        { rootMargin: '200px' },
      );
      observer.observe(node);
      return () => observer.disconnect();
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );
  const posts = feed.data?.pages.flatMap((page) => page.items) ?? [];
  const emptyTitle = match({ q, tab })
    .with({ q: P.string.minLength(1) }, () => t('일치하는 게시글이 없어요'))
    .with({ tab: 'unanswered' }, () => t('지금은 모든 요청에 답변이 있어요'))
    .with({ tab: 'latest' }, () => t('첫 번째 이야기를 기다려요'))
    .exhaustive();
  if (feed.error && !feed.isFetching) throw feed.error;
  if (!feed.data) return <PostListSkeleton />;
  return (
    <>
      {!posts.length && (
        <div className="empty-feed">
          <span>
            <MessageSquare size={30} />
          </span>
          <h3>{emptyTitle}</h3>
          <p>
            {q
              ? t('다른 단어로 검색하거나 새로운 글을 남겨보세요.')
              : t('플레이 이야기나 모집 글을 남겨보세요.')}
          </p>
          <Button variant="accent" size="md" type="button" onClick={handleCompose}>
            {t('글쓰기')}
            <ArrowUpRight size={16} />
          </Button>
        </div>
      )}
      <div className="post-list">
        {posts.map((post) => (
          <ServiceErrorBoundary key={post.id} title={t('게시글')} resetKey={post.id}>
            <PostCard
              post={post}
              href={appRoutes.post(locale, post.id)}
              authorName={<AuthorLink author={post.author} locale={locale} />}
              authorContent={<UserBadges author={post.author} compact />}
            />
          </ServiceErrorBoundary>
        ))}
      </div>
      <div ref={sentinel} className="feed-sentinel" />
      {feed.hasNextPage && (
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          type="button"
          className="load-more"
          loading={feed.isFetchingNextPage}
          icon={<Plus aria-hidden />}
          onClick={() => feed.fetchNextPage()}
        >
          {t('더 많은 글 보기')}
        </Button>
      )}
      {posts.length > 0 && !hasNextPage && (
        <div className="feed-end">
          <span />
          {t('여기까지, 모든 플레이 이야기를 만났어요')}
          <span />
        </div>
      )}
    </>
  );
}

export function FeedPage(props: Parameters<typeof FeedContent>[0]) {
  return (
    <CommunityPage locale={props.locale} topbar={<FeedTopbar locale={props.locale} />}>
      <FeedContent {...props} />
    </CommunityPage>
  );
}
