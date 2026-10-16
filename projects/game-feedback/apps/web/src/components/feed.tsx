'use client';
import Link from 'next/link';
import { listPosts } from '@game-feedback/sdk';
import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Plus,
  Search,
  SlidersHorizontal,
  MessageSquare,
  Check,
  Clock3,
  Sparkles,
  Trophy,
  ArrowRight,
  Crown,
  LoaderCircle,
} from 'lucide-react';
import { api, timeAgo, type Post, type PostPage } from '@/lib/api';
import { Avatar, ErrorNotice, useSession } from './providers';
import { PostComposer } from './post-composer';
import { Deck } from './game-profile';
import { UserBadges } from './user-badges';
export function Feed({ locale }: { locale: string }) {
  const { session, login } = useSession();
  const [tab, setTab] = useState('latest'),
    [search, setSearch] = useState(''),
    [q, setQ] = useState(''),
    [composer, setComposer] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(() => setQ(search.trim()), 350);
    return () => window.clearTimeout(timeout);
  }, [search]);
  const feed = useInfiniteQuery({
    queryKey: ['posts', tab, q],
    queryFn: ({ pageParam }) =>
      listPosts({
        limit: 8,
        category: 'clash-royale',
        ...(tab === 'unanswered' ? { unanswered: 'true' } : {}),
        ...(q ? { q } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor || undefined,
  });
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !feed.hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !feed.isFetchingNextPage) feed.fetchNextPage();
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [feed.hasNextPage, feed.isFetchingNextPage, feed.fetchNextPage]);
  const posts = feed.data?.pages.flatMap((page) => page.items) || [];
  function compose() {
    if (!session?.user) login();
    else setComposer(true);
  }
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <span />
            PLAY BETTER, TOGETHER
          </div>
          <h1>
            혼자 고민하던 플레이,
            <br />
            <span>함께 풀어볼까요?</span>
          </h1>
          <p>
            덱부터 운영까지, 플레이어들의 새로운 시선으로.
            <br />
            작은 피드백이 다음 경기의 차이를 만듭니다.
          </p>
          <button className="button dark hero-cta" onClick={compose}>
            첫 피드백 요청하기
            <ArrowUpRight size={17} />
          </button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <div className="hero-spark spark-one">✦</div>
          <div className="hero-spark spark-two">✳</div>
          <div className="art-card art-card-back">
            <Crown size={48} />
          </div>
          <div className="art-card art-card-front">
            <div className="art-card-dot" />
            <MessageSquare size={52} strokeWidth={1.6} />
            <span>GOOD PLAY!</span>
            <div className="art-card-bottom">
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className="hero-mini-badge">
            <Check size={15} />
            함께라면, 한 단계 더
          </div>
        </div>
        <div className="hero-index">01 — GAME FEEDBACK COMMUNITY</div>
      </section>
      <section className="feed-section">
        <div className="feed-heading">
          <div>
            <span className="section-eyebrow">FEEDBACK LOUNGE</span>
            <h2>
              피드백 라운지
              <span className="live-indicator">
                <span />
                LIVE
              </span>
            </h2>
          </div>
          <button className="button primary" onClick={compose}>
            <Plus size={17} />
            피드백 요청
          </button>
        </div>
        <div className="game-filter">
          <span className="game-filter-icon">
            <Crown size={20} />
          </span>
          <span>클래시 로얄</span>
          <span className="game-filter-label">Clash Royale</span>
          <span className="game-filter-pill">ACTIVE</span>
        </div>
        <div className="feed-controls">
          <div className="feed-tabs" role="tablist" aria-label="피드백 필터">
            <button
              role="tab"
              aria-selected={tab === 'latest'}
              className={tab === 'latest' ? 'active' : ''}
              onClick={() => setTab('latest')}
            >
              <Clock3 size={16} />
              최신 피드백
            </button>
            <button
              role="tab"
              aria-selected={tab === 'unanswered'}
              className={tab === 'unanswered' ? 'active' : ''}
              onClick={() => setTab('unanswered')}
            >
              <MessageSquare size={16} />
              답변을 기다려요
              <span className="tab-dot" />
            </button>
          </div>
          <div className="sort-label">
            <SlidersHorizontal size={14} />
            최신순
          </div>
        </div>
        <div className="feed-search">
          <Search size={17} />
          <input
            aria-label="피드백 검색"
            placeholder="함께 풀어보고 싶은 플레이를 검색하세요"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="text-button" onClick={() => setSearch('')}>
              초기화
            </button>
          )}
        </div>
        {feed.isPending && (
          <div className="feed-loading" aria-label="피드백 불러오는 중">
            {[1, 2, 3].map((n) => (
              <div className="skeleton-card" key={n}>
                <div />
                <div />
                <div />
              </div>
            ))}
          </div>
        )}
        {feed.isError && (
          <div className="state-box">
            <ErrorNotice message={feed.error.message} />
            <button className="button outline" onClick={() => feed.refetch()}>
              다시 불러오기
            </button>
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
            <button className="button dark" onClick={compose}>
              피드백 요청하기
              <ArrowUpRight size={16} />
            </button>
          </div>
        )}
        <div className="post-list">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} locale={locale} />
          ))}
        </div>
        <div ref={sentinel} className="feed-sentinel" />
        {feed.hasNextPage && (
          <button
            className="button outline full load-more"
            disabled={feed.isFetchingNextPage}
            onClick={() => feed.fetchNextPage()}
          >
            {feed.isFetchingNextPage ? <LoaderCircle className="spin" size={17} /> : <Plus size={16} />}더
            많은 피드백 보기
          </button>
        )}
        {posts.length > 0 && !feed.hasNextPage && (
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
      <PostComposer locale={locale} open={composer} onOpenChange={setComposer} />
    </>
  );
}
function PostCard({ post, locale }: { post: Post; locale: string }) {
  return (
    <Link href={`/${locale}/posts/${post.id}`} className="post-card">
      <div className="post-topline">
        <span
          className={`status-pill ${post.answerCount === 0 ? 'waiting' : post.helpfulCount > 0 ? 'resolved' : 'discussing'}`}
        >
          {post.answerCount === 0 ? (
            <>
              <span />
              답변 기다리는 중
            </>
          ) : post.helpfulCount > 0 ? (
            <>
              <Check size={12} />
              도움받았어요
            </>
          ) : (
            <>
              <MessageSquare size={12} />
              함께 이야기 중
            </>
          )}
        </span>
        <span className="post-time">{timeAgo(post.createdAt)}</span>
      </div>
      <h3>{post.title}</h3>
      <p className="post-excerpt">{post.body}</p>
      {post.gameProfile && (
        <div className="post-game-info">
          <div className="post-game-stat">
            <Trophy size={14} />
            <span>{post.gameProfile.trophies.toLocaleString()}</span>
            <span className="info-divider" />
            <span>{post.gameProfile.arena}</span>
          </div>
          <Deck profile={post.gameProfile} compact />
        </div>
      )}
      <div className="post-bottom">
        <span className="post-author">
          <Avatar name={post.author.nickname} size="small" />
          <strong>{post.author.nickname}</strong>
          <UserBadges author={post.author} compact />
          <span className="post-author-game">클래시 로얄</span>
        </span>
        <span className={`answer-count ${post.answerCount > 0 ? 'has-answers' : ''}`}>
          <MessageSquare size={15} />
          피드백<strong>{post.answerCount}</strong>
          <ArrowUpRight size={15} />
        </span>
      </div>
    </Link>
  );
}
