import 'server-only';
import { notFound } from 'next/navigation';
import { appRoutes, GameSlugSchema } from '@game-feedback/bridge';
import { boardBySlug } from '@/features/board';
import { getPublicCategories } from '@/features/category/index.server';
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
export async function BoardsRoute({ locale, slug, game }: { locale: string; slug: string; game?: unknown }) {
  const { board, category } = await resolveBoard(slug, game);
  const url = pageUrl(appRoutes.boards(locale, board.slug, undefined, category.slug));
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          '@id': url,
          url,
          name: `${category.name} ${board.name}`,
          description: board.description,
        }}
      />
      <BoardsPage locale={locale} slug={slug} game={category} />
    </>
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
