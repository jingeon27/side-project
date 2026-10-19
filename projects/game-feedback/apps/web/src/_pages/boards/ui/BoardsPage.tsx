'use client';
import { useRouter } from 'next/navigation';
import { useBrowserSearch } from '@/shared/navigation';
import { use } from 'react';
import { BattleFilters } from './BattleFilters';
import { CoachingFilters } from './CoachingFilters';
import { FeedbackFilters } from './FeedbackFilters';
import { readBoardFilters, boardSnapshotSearch, type TBoardFilters } from '../model/board-filters';
import { BoardEmptyState } from './BoardEmptyState';
import { parseCoachingRole } from '@/features/coaching';
import { parseBattleMode } from '@/features/battle';
import type { IBoardSnapshot } from '../model/board-snapshot.type';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@side/design-system';
import { appRoutes } from '@game-feedback/bridge';
import { boardBySlug } from '@/features/board';
import { postListOptions, PostCard, PostListSkeleton } from '@/features/post';
import { AuthorLink, UserBadges } from '@/features/user';
import { useSession } from '@/features/auth';
import { useI18n } from '@/shared/i18n';
import { AsyncBoundary, ServiceErrorBoundary } from '@/shared/ui';

interface IBoardsPageProps {
  locale: string;
  slug: string;
  initialBoard: IBoardSnapshot | Promise<IBoardSnapshot>;
}
export function BoardsPage(props: IBoardsPageProps) {
  const { locale, slug, initialBoard } = props;
  const { t } = useI18n();
  const board = boardBySlug(slug);
  const { session, login } = useSession();
  const router = useRouter();
  if (!board) return null;
  function handleCompose() {
    if (!session.user) {
      login();
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
  }
  return (
    <section className="board-page">
      <div className="page-heading board-heading">
        <h1>{t(board.name)}</h1>
        <Button variant="accent" size="md" type="button" onClick={handleCompose}>
          <Plus size={16} />
          {t(board.kind === 'COACHING' ? '코칭 등록' : '글쓰기')}
        </Button>
      </div>
      {board.kind === 'FEEDBACK' && (
        <FeedbackFilters
          locale={locale}
          initialSearch={'then' in initialBoard ? '' : boardSnapshotSearch(initialBoard)}
        />
      )}
      {board.kind === 'FRIENDLY' && <BattleFilters locale={locale} slug={slug} />}
      {board.kind === 'COACHING' && <CoachingFilters locale={locale} slug={slug} />}
      <AsyncBoundary
        title={t('게시판')}
        resetKey={`${session.user?.id}:${slug}`}
        refreshOnRetry
        suspense={'then' in initialBoard}
        pendingFallback={<PostListSkeleton />}
      >
        <BoardPostsRegion locale={locale} slug={slug} initialBoard={initialBoard} />
      </AsyncBoundary>
    </section>
  );
}
function BoardPostsRegion({ locale, slug, initialBoard }: IBoardsPageProps) {
  const initial = 'then' in initialBoard ? use(initialBoard) : initialBoard;
  const search = useBrowserSearch(boardSnapshotSearch(initial), `/${locale}/boards/${slug}`);
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
