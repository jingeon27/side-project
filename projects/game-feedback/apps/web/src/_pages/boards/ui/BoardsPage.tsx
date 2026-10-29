'use client';

import { useRouter } from 'next/navigation';

import { useInfiniteQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';

import { appRoutes } from '@game-feedback/bridge';
import { Button } from '@side/design-system';

import { useSession } from '@/features/auth';
import { parseBattleMode } from '@/features/battle';
import { boardBySlug } from '@/features/board';
import { parseCoachingRole } from '@/features/coaching';
import { PostCard, postListOptions, PostListSkeleton } from '@/features/post';
import { AuthorLink, UserBadges } from '@/features/user';
import { useI18n } from '@/shared/i18n';
import { useBrowserSearch } from '@/shared/navigation';
import { AsyncBoundary, Await, ServiceErrorBoundary } from '@/shared/ui';
import { CommunityPage } from '@/widgets/community-shell';

import { boardSnapshotSearch, readBoardFilters, type TBoardFilters } from '../model/board-filters';
import type { IBoardSnapshot } from '../model/board-snapshot.type';
import { BattleFilters } from './battle/BattleFilters';
import { BoardEmptyState } from './board/BoardEmptyState';
import { BoardsTopbar } from './BoardsTopbar';
import { CoachingFilters } from './coaching/CoachingFilters';
import { FeedbackFilters } from './feedback/FeedbackFilters';

interface IBoardsPageProps {
  locale: string;
  slug: string;
  initialBoard: IBoardSnapshot | Promise<IBoardSnapshot>;
}
function BoardsContent(props: IBoardsPageProps) {
  const { locale, slug, initialBoard } = props;
  const { t } = useI18n();
  const board = boardBySlug(slug);
  const { session, requireLogin } = useSession();
  const router = useRouter();
  if (!board) return null;
  // RSC 이동은 snapshot이 Promise라 브라우저 URL을 그대로 읽는다.
  const filterSearch = 'then' in initialBoard ? '' : boardSnapshotSearch(initialBoard);
  const handleCompose = () => {
    if (!session.user) {
      requireLogin();
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const game = params.get('game') ?? undefined;
    router.push(
      appRoutes.compose(locale, board?.kind, game, {
        battleMode: parseBattleMode(params.get('battleMode')),
        coachingRole: parseCoachingRole(params.get('coachingRole')),
      }),
    );
  };
  return (
    <section className="board-page">
      <div className="page-heading board-heading">
        <h1>{t(board.name)}</h1>
        <Button variant="accent" size="md" type="button" onClick={handleCompose}>
          <Plus size={16} />
          {t(board.kind === 'COACHING' ? '코칭 등록' : '글쓰기')}
        </Button>
      </div>
      {board.kind === 'FEEDBACK' && <FeedbackFilters locale={locale} initialSearch={filterSearch} />}
      {board.kind === 'FRIENDLY' && (
        <BattleFilters locale={locale} slug={slug} initialSearch={filterSearch} />
      )}
      {board.kind === 'COACHING' && (
        <CoachingFilters locale={locale} slug={slug} initialSearch={filterSearch} />
      )}
      <AsyncBoundary
        title={t('게시판')}
        resetKey={`${session.user?.id}:${slug}`}
        refreshOnRetry
        suspense={'then' in initialBoard}
        pendingFallback={<PostListSkeleton />}
      >
        <Await value={initialBoard}>
          {(initial) => <BoardPostsRegion locale={locale} slug={slug} initialBoard={initial} />}
        </Await>
      </AsyncBoundary>
    </section>
  );
}
function BoardPostsRegion({
  locale,
  slug,
  initialBoard,
}: Omit<IBoardsPageProps, 'initialBoard'> & { initialBoard: IBoardSnapshot }) {
  const initial = initialBoard;
  const search = useBrowserSearch(boardSnapshotSearch(initial), appRoutes.boards(locale, slug));
  const filters = readBoardFilters(search);
  const { session } = useSession();
  const { t } = useI18n();
  return (
    <ServiceErrorBoundary
      title={t('게시판')}
      resetKey={`${session.user?.id}:${slug}:${JSON.stringify(filters)}`}
    >
      <BoardPosts locale={locale} slug={slug} initial={initial} {...filters} />
    </ServiceErrorBoundary>
  );
}
interface IBoardPostsProps extends TBoardFilters {
  locale: string;
  slug: string;
  initial: IBoardSnapshot;
}
function BoardPosts({
  locale,
  slug,
  q,
  initial,
  battleMode,
  coachingRole,
  feedbackStatus,
}: IBoardPostsProps) {
  const { t } = useI18n();
  const board = boardBySlug(slug);
  const { session } = useSession();
  const game = initial.game;
  const posts = useInfiniteQuery({
    throwOnError: true,
    ...postListOptions({
      category: game.slug,
      board: board?.kind,
      q,
      battleMode,
      coachingRole,
      feedbackStatus,
      limit: 12,
    }),
    ...(q === initial.q &&
    battleMode === initial.battleMode &&
    coachingRole === initial.coachingRole &&
    feedbackStatus === initial.feedbackStatus &&
    initial.viewerId === session.user?.id
      ? { initialData: { pages: [initial.posts], pageParams: [''] }, initialDataUpdatedAt: 0 }
      : {}),
  });
  if (posts.error && !posts.isFetching) throw posts.error;
  if (!posts.data) return <PostListSkeleton />;
  const items = posts.data.pages.flatMap((page) => page.items);
  return (
    <>
      {!items.length && (
        <BoardEmptyState
          board={board?.kind}
          feedbackStatus={feedbackStatus}
          q={q}
          allFeedbackHref={appRoutes.boards(locale, slug, q, game.slug)}
        />
      )}
      <div className="post-list board-post-list">
        {items.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            showBoardLabel={board?.kind !== 'FEEDBACK'}
            href={appRoutes.post(locale, post.id, post.board, game.slug)}
            authorName={<AuthorLink author={post.author} locale={locale} />}
            authorContent={<UserBadges author={post.author} compact />}
          />
        ))}
      </div>
      {posts.hasNextPage && (
        <Button
          variant="secondary"
          size="md"
          type="button"
          disabled={posts.isFetchingNextPage}
          onClick={() => posts.fetchNextPage()}
        >
          {t('더 보기')}
        </Button>
      )}
    </>
  );
}

export function BoardsPage(props: Parameters<typeof BoardsContent>[0]) {
  return (
    <CommunityPage locale={props.locale} topbar={<BoardsTopbar locale={props.locale} slug={props.slug} />}>
      <BoardsContent {...props} />
    </CommunityPage>
  );
}
