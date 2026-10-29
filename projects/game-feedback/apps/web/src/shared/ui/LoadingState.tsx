'use client';

import { Spinner } from '@side/design-system';

import { useI18n } from '@/shared/i18n';

/** `text`는 번역을 마친 문구다. 없으면 기본 안내를 번역해 보인다. */
export function LoadingState({ text }: { text?: string }) {
  const { t } = useI18n();
  return (
    <div className="state-box">
      <Spinner />
      <p>{text ?? t('불러오고 있어요')}</p>
    </div>
  );
}
