import 'server-only';
import { initialDocumentData } from '@/shared/lib/initial-document-data';
import { Suspense } from 'react';
import type { IBoardSnapshot } from '../model/board-snapshot.type';
import { notFound } from 'next/navigation';
import { appRoutes, GameSlugSchema } from '@game-feedback/bridge';
import { boardBySlug } from '@/features/board';
import { BattleModeSchema, CoachingRoleSchema, FeedbackStatusSchema } from '@game-feedback/contracts';
import { getPublicCategories } from '@/features/category/index.server';
import { getServerSession } from '@/features/auth/index.server';
import { getServerPostList } from '@/features/post/index.server';
import { createPageMetadata, pageUrl, JsonLd } from '@/shared/seo';
import { BoardsPage } from './BoardsPage';

async function resolveBoard(slug: string, game: unknown) {
  const board = boardBySlug(slug);
  const parsed = GameSlugSchema.safeParse(game ?? 'clash-royale');
  if (!board || !parsed.success) notFound();
  const category = (await getPublicCategories()).find((item) => item.active && item.slug === parsed.data);
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
  const { board, category } = await resolveBoard(slug, params.game);
  const battle = BattleModeSchema.optional().safeParse(params.battleMode);
  if (!battle.success || (battle.data && board.kind !== 'FRIENDLY')) notFound();
  const coaching = CoachingRoleSchema.optional().safeParse(params.coachingRole);
  if (!coaching.success || (coaching.data && board.kind !== 'COACHING')) notFound();
  const feedback = FeedbackStatusSchema.optional().safeParse(params.feedbackStatus);
  if (!feedback.success || (feedback.data && board.kind !== 'FEEDBACK')) notFound();
  const q = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim().slice(0, 100) ?? '';
  const [posts, session] = await Promise.all([
    getServerPostList({
      category: category.slug,
      board: board.kind,
      q,
      battleMode: battle.data,
      coachingRole: coaching.data,
      feedbackStatus: feedback.data,
      limit: 12,
    }),
    getServerSession(),
  ]);
  return {
    game: category,
    posts,
    q,
    battleMode: battle.data,
    coachingRole: coaching.data,
    feedbackStatus: feedback.data,
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
  const { board, category } = await resolveBoard(slug, game);
  return createPageMetadata({
    title: `${category.name} ${board.name}`,
    description: board.description,
    path: appRoutes.boards(locale, board.slug, undefined, category.slug),
    keywords: [category.name, board.name, '게임 커뮤니티'],
  });
}
