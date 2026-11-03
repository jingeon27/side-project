'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';

import { appRoutes } from '@game-feedback/bridge';

import { parseBattleMode } from '@/features/battle';
import { boardBySlug } from '@/features/board';
import { parseCoachingRole } from '@/features/coaching';
import { parseFeedbackStatus } from '@/features/post';
import { useI18n } from '@/shared/i18n';
import { parseSearch } from '@/shared/lib/query-string';
import { useBrowserSearch } from '@/shared/navigation';
import { Topbar } from '@/widgets/community-shell';

interface IBoardsTopbarProps {
  locale: string;
  slug: string;
}

export function BoardsTopbar({ locale, slug }: IBoardsTopbarProps) {
  const { t } = useI18n();
  const board = boardBySlug(slug);
  return (
    <Topbar.Root className="feed-topbar">
      <Topbar.Title heading>{t(board?.name ?? '게시판')}</Topbar.Title>
      <Topbar.Actions>
        <Suspense fallback={null}>
          <BoardSearchLink locale={locale} slug={slug} />
        </Suspense>
        <div className="feed-header-language">
          <Topbar.Language />
        </div>
        <Topbar.Notifications href={appRoutes.notifications(locale)} />
        <Topbar.Account href={appRoutes.settings(locale)} />
      </Topbar.Actions>
    </Topbar.Root>
  );
}

function BoardSearchLink({ locale, slug }: IBoardsTopbarProps) {
  const pathname = usePathname();
  const params = parseSearch(useBrowserSearch('', pathname));
  return (
    <Topbar.Search
      href={appRoutes.search(locale, {
        board: slug,
        feedbackStatus: parseFeedbackStatus(params.feedbackStatus),
        game: params.game,
        q: params.q,
        battleMode: parseBattleMode(params.battleMode),
        coachingRole: parseCoachingRole(params.coachingRole),
      })}
    />
  );
}
