'use client';
import { appRoutes } from '@game-feedback/bridge';
import { boardByKind } from '@/features/board';
import type { Post } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { Topbar } from '@/widgets/community-shell';
export function PostTopbar({ locale, post }: { locale: string; post: Pick<Post, 'board' | 'category'> }) {
  const { t } = useI18n();
  const board = boardByKind(post.board);
  const parent = appRoutes.boards(locale, board?.slug ?? 'feedback', undefined, post.category.slug);
  return (
    <Topbar.Root>
      <Topbar.Back href={parent} logicalParent={parent} />
      <Topbar.Breadcrumb
        game={post.category.name}
        gameHref={appRoutes.boards(locale, 'feedback', undefined, post.category.slug)}
        board={t(board?.name ?? '게시글')}
        boardHref={parent}
      />
      <Topbar.Actions home={`/${locale}`} account={false} />
    </Topbar.Root>
  );
}
