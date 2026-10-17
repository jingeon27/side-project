'use client';
import type { TCoachingDetails } from '@game-feedback/contracts';
import { useI18n } from '@/shared/i18n';
import { formatWon } from '@/shared/lib/money';
import { coachingRoles } from '../model/coaching';

export function CoachingSummary({ details }: { details: TCoachingDetails }) {
  const { t, locale } = useI18n();
  const price = details.hourlyRate === null ? null : formatWon(details.hourlyRate, locale);
  return (
    <div className="coaching-summary" aria-label={t('코칭 정보')}>
      <strong>{t(coachingRoles.find((role) => role.value === details.role)?.label ?? '수강생 모집')}</strong>
      <span>{price ? t('시간당 {price}', { price }) : t('수강료 협의')}</span>
    </div>
  );
}
