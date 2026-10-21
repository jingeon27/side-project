'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';

import { appRoutes } from '@game-feedback/bridge';

import { parseBattleMode } from '@/features/battle';
import { parseCoachingRole } from '@/features/coaching';
import { parseFeedbackStatus } from '@/features/post';
import { useI18n } from '@/shared/i18n';
import { useBrowserSearch } from '@/shared/navigation';
import { Topbar } from '@/widgets/community-shell';

interface IBoardsTopbarProps {
  locale: string;
  slug: string;
}

export function BoardsTopbar({ locale, slug }: IBoardsTopbarProps) {
  const { t } = useI18n();
  return (
    <Topbar.Root>
      <Topbar.Brand home={appRoutes.feed(locale)} />
      <Topbar.Title>{t('홈')}</Topbar.Title>
      <Topbar.Actions>
        <Suspense fallback={null}>
          <BoardSearchLink locale={locale} slug={slug} />
        </Suspense>
        <Topbar.Language />
        <Topbar.Notifications href={appRoutes.notifications(locale)} />
        <Topbar.Account href={appRoutes.settings(locale)} />
      </Topbar.Actions>
    </Topbar.Root>
  );
}

function BoardSearchLink({ locale, slug }: IBoardsTopbarProps) {
  const pathname = usePathname();
  const params = new URLSearchParams(useBrowserSearch('', pathname));
  return (
    <Topbar.Search
      href={appRoutes.search(locale, {
        board: slug,
        feedbackStatus: parseFeedbackStatus(params.get('feedbackStatus')),
        game: params.get('game') ?? undefined,
        q: params.get('q') ?? undefined,
        battleMode: parseBattleMode(params.get('battleMode')),
        coachingRole: parseCoachingRole(params.get('coachingRole')),
      })}
    />
  );
}
