'use client';

import { match, P } from 'ts-pattern';

import type { TFriendSaleDetails } from '@game-feedback/contracts';

import { useI18n } from '@/shared/i18n';
import { formatWon } from '@/shared/lib/money';

export function FriendSaleSummary({ details }: { details?: TFriendSaleDetails | null }) {
  const { t, locale } = useI18n();
  const price = match(details)
    .with(P.nullish, () => t('판매 금액 미등록'))
    .with({ price: null }, () => t('가격 협의'))
    .with({ price: P.number }, (sale) => formatWon(sale.price, locale))
    .exhaustive();
  return (
    <div className="friend-sale-summary" aria-label={t('친추판매 정보')}>
      <strong>{t('판매 금액')}</strong>
      <span>{price}</span>
    </div>
  );
}
