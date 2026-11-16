'use client';

import { appRoutes } from '@game-feedback/bridge';
import type { TBattleMode } from '@game-feedback/contracts';

import { parseBattleMode } from '@/features/battle';
import { useI18n } from '@/shared/i18n';
import { parseSearch } from '@/shared/lib/query-string';
import { useBrowserSearch } from '@/shared/navigation';

import { BoardFilterLink } from '../board/BoardFilterLink';

interface IBattleFiltersProps {
  locale: string;
  slug: string;
  /** 서버 snapshot의 검색 문자열. 첫 HTML과 hydration이 URL과 같은 칩을 표시한다. */
  initialSearch: string;
}

export function BattleFilters({ locale, slug, initialSearch }: IBattleFiltersProps) {
  const { t } = useI18n();
  const params = parseSearch(useBrowserSearch(initialSearch, appRoutes.boards(locale, slug)));
  const mode = parseBattleMode(params.battleMode);
  const hrefFor = (value?: TBattleMode) =>
    appRoutes.boards(locale, slug, params.q, params.game, {
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
