'use client';

import { appRoutes } from '@game-feedback/bridge';
import type { TBattleMode } from '@game-feedback/contracts';
import { parseBattleMode } from '@/features/battle';
import { useI18n } from '@/shared/i18n';
import { useBrowserSearch } from '@/shared/navigation';
import { BoardFilterLink } from './BoardFilterLink';

export function BattleFilters({ locale, slug }: { locale: string; slug: string }) {
  const { t } = useI18n();
  const params = new URLSearchParams(useBrowserSearch('', `/${locale}/boards/${slug}`));
  const mode = parseBattleMode(params.get('battleMode'));
  const hrefFor = (value?: TBattleMode) =>
    appRoutes.boards(locale, slug, params.get('q') ?? undefined, params.get('game') ?? undefined, {
      battleMode: value,
    });
  return (
    <nav className="battle-filters" aria-label={t('전투 유형')}>
      <BoardFilterLink href={hrefFor()} active={mode === undefined}>
        {t('전체')}
      </BoardFilterLink>
      <BoardFilterLink href={hrefFor('DUEL')} active={mode === 'DUEL'}>
        {t('1:1')}
      </BoardFilterLink>
      <BoardFilterLink href={hrefFor('TEAM')} active={mode === 'TEAM'}>
        {t('팀전')}
      </BoardFilterLink>
    </nav>
  );
}
