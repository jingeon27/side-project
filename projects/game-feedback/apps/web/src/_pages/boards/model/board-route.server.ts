import 'server-only';

import { notFound } from 'next/navigation';

import { appRoutes, BoardQuerySchema } from '@game-feedback/bridge';

import { getServerSession } from '@/features/auth/index.server';
import { boardBySlug } from '@/features/board';
import { getPublicCategories } from '@/features/category/index.server';
import { getServerPostList } from '@/features/post/index.server';
import { createPageMetadata } from '@/shared/seo';

import type { IBoardRouteProps } from './board-page.type';
import type { IBoardSnapshot } from './board-snapshot.type';

async function resolveBoard(slug: string, game: string) {
  const board = boardBySlug(slug);
  if (!board) notFound();
  const category = (await getPublicCategories()).find((item) => item.active && item.slug === game);
  if (!category) notFound();
  return { board, category };
}

export async function boardSnapshot(
  slug: string,
  searchParams: IBoardRouteProps['searchParams'],
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
