import 'server-only';

import { notFound } from 'next/navigation';

import { appRoutes, BoardQuerySchema } from '@game-feedback/bridge';

import { boardBySlug } from '@/features/board';
import { getPublicCategories } from '@/features/category/index.server';
import { CommunityPage } from '@/widgets/community-shell';

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
  const hasCategoryContext = board !== undefined || (game !== undefined && game !== null);
  const parsed = BoardQuerySchema.safeParse({ board, game: game ?? undefined, battleMode, coachingRole });
  if (!parsed.success) notFound();
  const context = parsed.data;
  const selected = context.board ? boardBySlug(context.board) : undefined;
  const categories = (await getPublicCategories()).filter((item) => item.active);
  const category = categories.find((item) => item.slug === context.game);
  if (!category) notFound();
  return (
    <CommunityPage locale={locale} topbar={null}>
      <PostComposePage
        locale={locale}
        categories={categories}
        board={selected?.kind ?? 'FEEDBACK'}
        categoryId={hasCategoryContext ? category.id : undefined}
        battleMode={context.battleMode}
        coachingRole={context.coachingRole}
        parent={
          selected
            ? appRoutes.boards(locale, selected.slug, undefined, category.slug, {
                battleMode: context.battleMode,
                coachingRole: context.coachingRole,
              })
            : appRoutes.feed(locale)
        }
      />
    </CommunityPage>
  );
}
