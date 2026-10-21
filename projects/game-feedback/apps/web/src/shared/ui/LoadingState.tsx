'use client';

import { Spinner } from '@side/design-system';

import { useI18n } from '@/shared/i18n';

export function LoadingState({ text = '불러오고 있어요' }: { text?: string }) {
  const { t } = useI18n();
  return (
    <div className="state-box">
      <Spinner />
      <p>{t(text)}</p>
    </div>
  );
}
