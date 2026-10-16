'use client';
import { Button } from '@side/design-system';
import Link from 'next/link';
import { Suspense, useEffect, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowUpRight, Plus, MessageSquare, Sparkles, ArrowRight, LoaderCircle } from 'lucide-react';
import { useSession } from '@/features/auth';
import { postListOptions, PostCard } from '@/features/post';
import { AuthorLink, UserBadges } from '@/features/user';
import { Deck } from '@/features/game-profile';
import { PostComposer } from '@/widgets/post-composer';
import { openOverlay, ErrorNotice, LoadingState, ServiceErrorBoundary } from '@/shared/ui';
import { useFeedFilters } from '../model/use-feed-filters';
import { FeedHero } from './FeedHero';
import { FeedFilters } from './FeedFilters';
export function FeedPage({ locale }: { locale: string }) {
  return (
    <Suspense fallback={<LoadingState />}>
      <FeedContent locale={locale} />
    </Suspense>
  );
}

function FeedContent({ locale }: { locale: string }) {
  const { session, login } = useSession();
  const { tab, q, search, handleTabChange, handleSearchChange } = useFeedFilters();
  const feed = useInfiniteQuery(
    postListOptions({
      limit: 8,
      category: 'clash-royale',
      ...(tab === 'unanswered' ? { unanswered: 'true' } : {}),
      ...(q ? { q } : {}),
    }),
  );
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = feed;
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const posts = feed.data?.pages.flatMap((page) => page.items) || [];
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
    <>
      <FeedHero onCompose={handleCompose} />
      <section className="feed-section">
        <FeedFilters
          tab={tab}
          search={search}
          onTabChange={handleTabChange}
          onSearchChange={handleSearchChange}
          onCompose={handleCompose}
        />
        {feed.isPending && (
          <div className="feed-loading" aria-label="피드백 불러오는 중">
            <PostCardSkeleton />
            <PostCardSkeleton />
            <PostCardSkeleton />
          </div>
        )}
        {feed.isError && (
          <div className="state-box">
            <ErrorNotice message={feed.error.message} />
            <Button
              variant="secondary"
              size="md"
              type="submit"
              className="button outline"
              onClick={() => feed.refetch()}
            >
              다시 불러오기
            </Button>
          </div>
        )}
        {!feed.isPending && !feed.isError && !posts.length && (
          <div className="empty-feed">
            <span>
              <MessageSquare size={30} />
            </span>
            <h3>
              {q
                ? '아직 일치하는 피드백이 없어요'
                : tab === 'unanswered'
                  ? '지금은 모든 요청에 답변이 있어요'
                  : '첫 번째 이야기를 기다려요'}
            </h3>
            <p>
              {q
                ? '다른 단어로 검색하거나 새로운 질문을 남겨보세요.'
                : '여러분의 플레이 고민이 누군가에게는 좋은 대화의 시작이에요.'}
            </p>
            <Button variant="primary" size="md" type="submit" className="button dark" onClick={handleCompose}>
              피드백 요청하기
              <ArrowUpRight size={16} />
            </Button>
          </div>
        )}
        <div className="post-list">
          {posts.map((post) => (
            <ServiceErrorBoundary key={post.id} title="피드백 카드" resetKey={post.id}>
              <PostCard
                post={post}
                href={`/${locale}/posts/${post.id}`}
                authorName={<AuthorLink author={post.author} locale={locale} />}
                authorContent={<UserBadges author={post.author} compact />}
                deck={post.gameProfile && <Deck profile={post.gameProfile} compact />}
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
            {feed.isFetchingNextPage ? <LoaderCircle className="spin" size={17} /> : <Plus size={16} />}더
            많은 피드백 보기
          </Button>
        )}
        {posts.length > 0 && !hasNextPage && (
          <div className="feed-end">
            <span />
            여기까지, 모든 플레이 이야기를 만났어요
            <span />
          </div>
        )}
        <div className="feed-footer">
          <Sparkles size={16} />
          <span>경험을 나누는 것만으로도, 누군가의 플레이는 달라집니다.</span>
          <Link href={`/${locale}/guide`}>
            함께하는 방법
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>
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
