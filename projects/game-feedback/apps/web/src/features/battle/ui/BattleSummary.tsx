'use client';

import type { TBattleDetails } from '@game-feedback/contracts';
import { useI18n } from '@/shared/i18n';
import { battleModeLabel } from '../model/battle';

export function BattleSummary({ details }: { details: TBattleDetails }) {
  const { t } = useI18n();
  return (
    <div className="battle-summary" aria-label={t('전투 유형')}>
      <strong>{t(battleModeLabel(details.mode))}</strong>
    </div>
  );
}
