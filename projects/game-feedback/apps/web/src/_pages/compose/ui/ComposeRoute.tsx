import 'server-only';
import { notFound } from 'next/navigation';
import { appRoutes, GameSlugSchema } from '@game-feedback/bridge';
import { boardBySlug } from '@/features/board';
import { getPublicCategories } from '@/features/category/index.server';
import { PostComposePage } from './PostComposePage';

export async function ComposeRoute({
  locale,
  board,
  game,
}: {
  locale: string;
  board?: unknown;
  game?: unknown;
}) {
  const selected = typeof board === 'string' ? boardBySlug(board) : undefined;
  const parsedGame = GameSlugSchema.safeParse(game ?? 'clash-royale');
  if ((board !== undefined && !selected) || !parsedGame.success) notFound();
  const categories = (await getPublicCategories()).filter((item) => item.active);
  const category = categories.find((item) => item.slug === parsedGame.data);
  if (!category) notFound();
  return (
    <PostComposePage
      locale={locale}
      categories={categories}
      board={selected?.kind ?? 'FEEDBACK'}
      categoryId={selected || game ? category.id : undefined}
      parent={
        selected ? appRoutes.boards(locale, selected.slug, undefined, category.slug) : appRoutes.feed(locale)
      }
    />
  );
}
