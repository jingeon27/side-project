'use client';

import type { ReactNode } from 'react';

import { useInfiniteQuery } from '@tanstack/react-query';

import { appRoutes } from '@game-feedback/bridge';
import type { TBoardKind } from '@game-feedback/contracts';
import { Button } from '@side/design-system';

import { useSession } from '@/features/auth';
import { postListOptions, PostListSkeleton } from '@/features/post';
import type { Category, Post } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { useBrowserSearch } from '@/shared/navigation';
import { AsyncBoundary, Await, ServiceErrorBoundary } from '@/shared/ui';

import { boardSnapshotSearch, readBoardFilters, type TBoardFilters } from '../../model/board-filters';
import type { IBoardPageProps } from '../../model/board-page.type';
import type { IBoardSnapshot } from '../../model/board-snapshot.type';
import { BoardEmptyState } from './BoardEmptyState';

interface IBoardPostListProps extends IBoardPageProps {
  board: TBoardKind;
  slug: string;
  children: (post: Post, game: Category) => ReactNode;
}

export function BoardPostList(props: IBoardPostListProps) {
  const { t } = useI18n();
  const { session } = useSession();
  return (
    <AsyncBoundary
      title={t('게시판')}
      resetKey={session.user?.id + ':' + props.slug}
      refreshOnRetry
      suspense={'then' in props.initialBoard}
      pendingFallback={<PostListSkeleton />}
    >
      <Await value={props.initialBoard}>
        {(initial) => <BoardPostsRegion {...props} initialBoard={initial} />}
      </Await>
    </AsyncBoundary>
  );
}

function BoardPostsRegion(props: IBoardPostListProps & { initialBoard: IBoardSnapshot }) {
  const search = useBrowserSearch(
    boardSnapshotSearch(props.initialBoard),
    appRoutes.boards(props.locale, props.slug),
  );
  const filters = readBoardFilters(search);
  const { session } = useSession();
  const { t } = useI18n();
  return (
    <ServiceErrorBoundary
      title={t('게시판')}
      resetKey={session.user?.id + ':' + props.slug + ':' + JSON.stringify(filters)}
    >
      <BoardPosts {...props} filters={filters} />
    </ServiceErrorBoundary>
  );
}

function BoardPosts({
  locale,
  slug,
  board,
  initialBoard: initial,
  filters,
  children,
}: IBoardPostListProps & { initialBoard: IBoardSnapshot; filters: TBoardFilters }) {
  const { t } = useI18n();
  const { session } = useSession();
  const { q, battleMode, coachingRole, feedbackStatus } = filters;
  const game = initial.game;
  const sameQuery =
    q === initial.q &&
    battleMode === initial.battleMode &&
    coachingRole === initial.coachingRole &&
    feedbackStatus === initial.feedbackStatus &&
    initial.viewerId === session.user?.id;
  const posts = useInfiniteQuery({
    throwOnError: true,
    ...postListOptions({
      category: game.slug,
      board,
      q,
      battleMode,
      coachingRole,
      feedbackStatus,
      limit: 12,
    }),
    ...(sameQuery
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
          board={board}
          feedbackStatus={feedbackStatus}
          q={q}
          allFeedbackHref={appRoutes.boards(locale, slug, q, game.slug)}
        />
      )}
      <div className="post-list board-post-list">{items.map((post) => children(post, game))}</div>
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
