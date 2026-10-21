import 'server-only';

import { notFound } from 'next/navigation';

import { appRoutes, GameSlugSchema } from '@game-feedback/bridge';
import { BattleModeSchema, CoachingRoleSchema } from '@game-feedback/contracts';

import { boardBySlug } from '@/features/board';
import { getPublicCategories } from '@/features/category/index.server';

import { PostComposePage } from './PostComposePage';

export async function ComposeRoute({
  locale,
  board,
  game,
  battleMode,
  coachingRole,
}: {
  locale: string;
  board?: unknown;
  game?: unknown;
  battleMode?: unknown;
  coachingRole?: unknown;
}) {
  const selected = typeof board === 'string' ? boardBySlug(board) : undefined;
  const parsedGame = GameSlugSchema.safeParse(game ?? 'clash-royale');
  if ((board !== undefined && !selected) || !parsedGame.success) notFound();
  const battle = BattleModeSchema.optional().safeParse(battleMode);
  if (!battle.success || (battle.data && selected?.kind !== 'FRIENDLY')) notFound();
  const coaching = CoachingRoleSchema.optional().safeParse(coachingRole);
  if (!coaching.success || (coaching.data && selected?.kind !== 'COACHING')) notFound();
  const categories = (await getPublicCategories()).filter((item) => item.active);
  const category = categories.find((item) => item.slug === parsedGame.data);
  if (!category) notFound();
  return (
    <PostComposePage
      locale={locale}
      categories={categories}
      board={selected?.kind ?? 'FEEDBACK'}
      categoryId={selected || game ? category.id : undefined}
      battleMode={battle.data}
      coachingRole={coaching.data}
      parent={
        selected
          ? appRoutes.boards(locale, selected.slug, undefined, category.slug, {
              battleMode: battle.data,
              coachingRole: coaching.data,
            })
          : appRoutes.feed(locale)
      }
    />
  );
}
