'use client';

import { appRoutes, resolveAppRoute } from '@game-feedback/bridge';
import { Search } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { parseBattleMode } from '@/features/battle';
import { parseCoachingRole } from '@/features/coaching';
import { useI18n } from '@/shared/i18n';
import { TabLink, useBrowserSearch } from '@/shared/navigation';

export function HeaderSearch() {
  const { t } = useI18n();
  const pathname = usePathname();
  const params = new URLSearchParams(useBrowserSearch('', pathname));
  const route = resolveAppRoute(pathname);
  if (!route || !['feed', 'boards'].includes(route.screen)) return null;
  const slug = pathname.split('/').at(-1);
  const board = route.screen === 'boards' ? (slug === 'boards' ? 'feedback' : slug) : undefined;
  const href = appRoutes.search(route.locale, {
    board,
    game: params.get('game') ?? undefined,
    q: params.get('q') ?? undefined,
    tab: params.get('tab') ?? undefined,
    battleMode: parseBattleMode(params.get('battleMode')),
    coachingRole: parseCoachingRole(params.get('coachingRole')),
  });
  return (
    <TabLink href={href} className="icon-button" aria-label={t('검색')}>
      <Search size={21} aria-hidden="true" />
    </TabLink>
  );
}
