'use client';
import { useI18n } from '@/shared/i18n';
import { Button } from '@side/design-system';
import { useCallback } from 'react';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { ArrowUpRight, Plus, MessageSquare, LoaderCircle } from 'lucide-react';
import { useSession } from '@/features/auth';
import { postListOptions, PostCard } from '@/features/post';
import { AuthorLink, UserBadges } from '@/features/user';
import { PostComposer } from '@/widgets/post-composer';
import { openOverlay, AsyncBoundary, ServiceErrorBoundary } from '@/shared/ui';
import { useFeedFilters } from '../model/use-feed-filters';
import { appRoutes } from '@game-feedback/bridge';
import { FeedFilters } from './FeedFilters';
export function FeedPage({ locale }: { locale: string }) {
  const { t } = useI18n();
  return (
    <AsyncBoundary title={t('피드')}>
      <FeedContent locale={locale} />
    </AsyncBoundary>
  );
}

function FeedContent({ locale }: { locale: string }) {
  const { t } = useI18n();
  const { session, login } = useSession();
  const { tab, q, search, handleTabChange, handleSearchChange } = useFeedFilters();
  function handleCompose() {
    if (!session?.user) {
      login();
      return;
    }
    openOverlay(({ isOpen, close, unmount }) => (
      <PostComposer
        locale={locale}
        open={isOpen}
        onOpenChange={(next) => {
          if (next) return;
          close();
          unmount();
        }}
      />
    ));
  }

  return (
    <section className="feed-section">
      <FeedFilters
        tab={tab}
        search={search}
        onTabChange={handleTabChange}
        onSearchChange={handleSearchChange}
        onCompose={handleCompose}
      />
      <AsyncBoundary
        clientOnly
        title={t('최신 글')}
        resetKey={`${session?.user?.id ?? 'anonymous'}:${tab}:${q}`}
        pendingFallback={
          <div className="feed-loading" aria-label={t('게시글 불러오는 중')}>
            <PostCardSkeleton />
            <PostCardSkeleton />
            <PostCardSkeleton />
          </div>
        }
      >
        <FeedResults locale={locale} tab={tab} q={q} onCompose={handleCompose} />
      </AsyncBoundary>
    </section>
  );
}
function FeedResults({
  locale,
  tab,
  q,
  onCompose: handleCompose,
}: {
  locale: string;
  tab: string;
  q: string;
  onCompose: () => void;
}) {
  const { t } = useI18n();
  const feed = useSuspenseInfiniteQuery(
    postListOptions({
      limit: 8,
      board: tab === 'unanswered' ? 'FEEDBACK' : 'ALL',
      ...(tab === 'unanswered' ? { unanswered: 'true' } : {}),
      ...(q ? { q } : {}),
    }),
  );
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
  const posts = feed.data.pages.flatMap((page) => page.items);
  if (feed.error && !feed.isFetching) throw feed.error;
  return (
    <>
      {!posts.length && (
        <div className="empty-feed">
          <span>
            <MessageSquare size={30} />
          </span>
          <h3>
            {q
              ? t('일치하는 게시글이 없어요')
              : tab === 'unanswered'
                ? t('지금은 모든 요청에 답변이 있어요')
                : t('첫 번째 이야기를 기다려요')}
          </h3>
          <p>
            {q
              ? t('다른 단어로 검색하거나 새로운 글을 남겨보세요.')
              : t('플레이 이야기나 모집 글을 남겨보세요.')}
          </p>
          <Button variant="primary" size="md" type="submit" className="button dark" onClick={handleCompose}>
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
          type="submit"
          className="button outline full load-more"
          disabled={feed.isFetchingNextPage}
          onClick={() => feed.fetchNextPage()}
        >
          {feed.isFetchingNextPage ? <LoaderCircle className="spin" size={17} /> : <Plus size={16} />}
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
function PostCardSkeleton() {
  return (
    <div className="skeleton-card">
      <div />
      <div />
      <div />
    </div>
  );
}
