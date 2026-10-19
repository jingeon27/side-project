'use client';
import { appRoutes } from '@game-feedback/bridge';
import { ChevronRight } from 'lucide-react';
import { boardByKind } from '@/features/board';
import type { Post } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { TabLink } from '@/shared/navigation';
import { Topbar } from '@/widgets/community-shell';
export function PostTopbar({ locale, post }: { locale: string; post: Pick<Post, 'board' | 'category'> }) {
  const { t } = useI18n();
  const board = boardByKind(post.board);
  const parent = appRoutes.boards(locale, board?.slug ?? 'feedback', undefined, post.category.slug);
  return (
    <Topbar.Root>
      <Topbar.Back href={parent} logicalParent={parent} />
      <nav className="post-breadcrumb" aria-label={t('게시글 경로')}>
        <TabLink
          href={appRoutes.boards(locale, 'feedback', undefined, post.category.slug)}
          title={post.category.name}
        >
          {post.category.name}
        </TabLink>
        <ChevronRight size={14} aria-hidden="true" />
        <TabLink href={parent}>{t(board?.name ?? '게시글')}</TabLink>
      </nav>
      <Topbar.Actions>
        <Topbar.Language />
        <Topbar.Notifications href={appRoutes.notifications(locale)} />
      </Topbar.Actions>
    </Topbar.Root>
  );
}
