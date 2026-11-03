'use client';

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useInfiniteQuery } from '@tanstack/react-query';
import { MessageCircleQuestion, Newspaper, Plus, SearchX } from 'lucide-react';
import { match, P } from 'ts-pattern';

import { appRoutes } from '@game-feedback/bridge';
import { Button } from '@side/design-system';

import { useSession } from '@/features/auth';
import {
  PostCard,
  PostCardActivity,
  PostCardBoard,
  PostCardContent,
  PostCardDetails,
  PostCardFooter,
  PostCardHeader,
  postListOptions,
  PostListSkeleton,
} from '@/features/post';
import { AuthorLink, UserBadges } from '@/features/user';
import { useI18n } from '@/shared/i18n';
import { parseSearch } from '@/shared/lib/query-string';
import { useBrowserSearch } from '@/shared/navigation';
import { AsyncBoundary, Await, ServiceErrorBoundary } from '@/shared/ui';
import { CommunityPage } from '@/widgets/community-shell';
import { FloatingComposeButton } from '@/widgets/compose-entry';

import { feedSnapshotSearch } from '../model/feed-snapshot-search';
import type { IFeedSnapshot } from '../model/feed-snapshot.type';
import { FeedTopbar } from './FeedTopbar';

function FeedContent({
  locale,
  initialFeed,
}: {
  locale: string;
  initialFeed: IFeedSnapshot | Promise<IFeedSnapshot>;
}) {
  const { t } = useI18n();
  const { session } = useSession();

  return (
    <section className="feed-section">
      <AsyncBoundary
        title={t('최신 글')}
        resetKey={session.user?.id}
        refreshOnRetry
        suspense={'then' in initialFeed}
        pendingFallback={<PostListSkeleton />}
      >
        <Await value={initialFeed}>
          {(initial) => <FeedResultsRegion locale={locale} initialFeed={initial} />}
        </Await>
      </AsyncBoundary>
    </section>
  );
}

function FeedResultsRegion({ locale, initialFeed }: { locale: string; initialFeed: IFeedSnapshot }) {
  const { t } = useI18n();
  const { session } = useSession();
  const initial = initialFeed;
  const search = useBrowserSearch(feedSnapshotSearch(initial), appRoutes.feed(locale));
  const params = parseSearch(search);
  const tab = params.tab === 'unanswered' ? 'unanswered' : 'latest';
  const q = params.q?.trim().slice(0, 100) ?? '';
  return (
    <ServiceErrorBoundary title={t('최신 글')} resetKey={`${session.user?.id ?? 'anonymous'}:${tab}:${q}`}>
      <FeedResults locale={locale} tab={tab} q={q} initial={initial} />
    </ServiceErrorBoundary>
  );
}
function FeedResults({
  locale,
  tab,
  q,
  initial,
}: {
  locale: string;
  tab: 'latest' | 'unanswered';
  q: string;
  initial: IFeedSnapshot;
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
  const emptyIcon = match({ q, tab })
    .with({ q: P.string.minLength(1) }, () => <SearchX className="size-full" />)
    .with({ tab: 'unanswered' }, () => <MessageCircleQuestion className="size-full" />)
    .with({ tab: 'latest' }, () => <Newspaper className="size-full" />)
    .exhaustive();
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
          <span
            aria-hidden
            className="relative mx-auto mb-3 inline-grid size-14 shrink-0 place-items-center text-accent"
          >
            {emptyIcon}
          </span>
          <h3>{emptyTitle}</h3>
          <p>
            {q
              ? t('다른 단어로 검색하거나 새로운 글을 남겨보세요.')
              : t('플레이 이야기나 모집 글을 남겨보세요.')}
          </p>
        </div>
      )}
      <div className="post-list">
        {posts.map((post) => (
          <ServiceErrorBoundary key={post.id} title={t('게시글')} resetKey={post.id}>
            <PostCard board={post.board}>
              <PostCardHeader post={post}>
                <PostCardBoard post={post} />
              </PostCardHeader>
              <PostCardContent post={post} href={appRoutes.post(locale, post.id)}>
                <PostCardDetails post={post} />
              </PostCardContent>
              <PostCardFooter
                post={post}
                authorName={<AuthorLink author={post.author} locale={locale} />}
                authorContent={<UserBadges author={post.author} compact showTag={false} />}
              >
                <PostCardActivity post={post} />
              </PostCardFooter>
            </PostCard>
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
  const { session, requireLogin } = useSession();
  const router = useRouter();
  const userId = session.user?.id;
  useEffect(() => {
    if (!userId) return;
    router.prefetch(appRoutes.compose(props.locale));
  }, [props.locale, router, userId]);
  const handleCompose = () => {
    if (!session.user) {
      requireLogin();
      return;
    }
    router.push(appRoutes.compose(props.locale));
  };
  return (
    <CommunityPage screenKey="feed" locale={props.locale} topbar={<FeedTopbar locale={props.locale} />}>
      <FloatingComposeButton onCompose={handleCompose} />
      <FeedContent {...props} />
    </CommunityPage>
  );
}
