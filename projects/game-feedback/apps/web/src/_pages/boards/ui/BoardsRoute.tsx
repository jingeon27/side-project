import 'server-only';

import { Suspense } from 'react';
import { notFound } from 'next/navigation';

import { appRoutes, BoardQuerySchema } from '@game-feedback/bridge';

import { getServerSession } from '@/features/auth/index.server';
import { boardBySlug } from '@/features/board';
import { getPublicCategories } from '@/features/category/index.server';
import { getServerPostList } from '@/features/post/index.server';
import { initialDocumentData } from '@/shared/lib/initial-document-data';
import { createPageMetadata, JsonLd, pageUrl } from '@/shared/seo';

import type { IBoardSnapshot } from '../model/board-snapshot.type';
import { BoardsPage } from './BoardsPage';

async function resolveBoard(slug: string, game: string) {
  const board = boardBySlug(slug);
  if (!board) notFound();
  const category = (await getPublicCategories()).find((item) => item.active && item.slug === game);
  if (!category) notFound();
  return { board, category };
}
interface IBoardsRouteProps {
  locale: string;
  slug: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  blockUntilReady: boolean;
}
async function snapshot(
  slug: string,
  searchParams: IBoardsRouteProps['searchParams'],
): Promise<IBoardSnapshot> {
  const params = await searchParams;
  const parsed = BoardQuerySchema.safeParse({ ...params, board: slug, game: params.game ?? undefined });
  if (!parsed.success) notFound();
  const { battleMode, coachingRole, feedbackStatus } = parsed.data;
  const { board, category } = await resolveBoard(slug, parsed.data.game);
  const q = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim().slice(0, 100) ?? '';
  const [posts, session] = await Promise.all([
    getServerPostList({
      category: category.slug,
      board: board.kind,
      q,
      battleMode,
      coachingRole,
      feedbackStatus,
      limit: 12,
    }),
    getServerSession(),
  ]);
  return {
    game: category,
    posts,
    q,
    battleMode,
    coachingRole,
    feedbackStatus,
    viewerId: session.user?.id,
  };
}
export async function BoardsRoute({ locale, slug, searchParams, blockUntilReady }: IBoardsRouteProps) {
  const initialData = await initialDocumentData(snapshot(slug, searchParams), blockUntilReady);
  const initialBoard = initialData.value;
  return (
    <>
      {'then' in initialBoard ? (
        <Suspense fallback={null}>
          <DeferredBoardJsonLd locale={locale} slug={slug} initialBoard={initialBoard} />
        </Suspense>
      ) : (
        <BoardJsonLd locale={locale} slug={slug} initialBoard={initialBoard} />
      )}
      <BoardsPage locale={locale} slug={slug} initialBoard={initialBoard} />
    </>
  );
}
async function DeferredBoardJsonLd({
  locale,
  slug,
  initialBoard,
}: {
  locale: string;
  slug: string;
  initialBoard: Promise<IBoardSnapshot>;
}) {
  const initial = await initialBoard.catch(() => null);
  if (!initial) return null;
  return <BoardJsonLd locale={locale} slug={slug} initialBoard={initial} />;
}
function BoardJsonLd({
  locale,
  slug,
  initialBoard,
}: {
  locale: string;
  slug: string;
  initialBoard: IBoardSnapshot;
}) {
  const { game } = initialBoard;
  const board = boardBySlug(slug);
  if (!board) return null;
  const url = pageUrl(appRoutes.boards(locale, slug, undefined, game.slug));
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        '@id': url,
        url,
        name: `${game.name} ${board.name}`,
        description: board.description,
      }}
    />
  );
}
export async function boardMetadata(locale: string, slug: string, game?: unknown) {
  const parsed = BoardQuerySchema.safeParse({ board: slug, game: game ?? undefined });
  if (!parsed.success) notFound();
  const { board, category } = await resolveBoard(slug, parsed.data.game);
  return createPageMetadata({
    title: `${category.name} ${board.name}`,
    description: board.description,
    path: appRoutes.boards(locale, board.slug, undefined, category.slug),
    keywords: [category.name, board.name, '게임 커뮤니티'],
  });
}
