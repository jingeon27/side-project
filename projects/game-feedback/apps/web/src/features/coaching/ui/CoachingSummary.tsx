'use client';

import type { TCoachingDetails } from '@game-feedback/contracts';

import { useI18n } from '@/shared/i18n';
import { formatWon } from '@/shared/lib/money';

import { coachingPricingTypes, coachingRoles } from '../model/coaching';

export function CoachingSummary({ details }: { details: TCoachingDetails }) {
  const { t, locale } = useI18n();
  const { pricing } = details;
  const price = pricing.amount === null ? null : formatWon(pricing.amount, locale);
  const pricingType = coachingPricingTypes.find((item) => item.value === pricing.type);
  return (
    <div className="coaching-summary" aria-label={t('코칭 정보')}>
      <strong>{t(coachingRoles.find((role) => role.value === details.role)?.label ?? '수강생 모집')}</strong>
      <span>
        {price
          ? t(pricingType?.priceLabel ?? '시간당 {price}', { price })
          : t('{basis} 수강료 협의', { basis: t(pricingType?.label ?? '시간당') })}
      </span>
      {pricing.type === 'GOAL' && <span>{t('목표 {target}까지', { target: pricing.targetScore })}</span>}
    </div>
  );
}
