'use client';

import { useI18n } from '@/shared/i18n';
import { ErrorRecovery } from '@/shared/ui';

export function RouteError({ retry }: { retry: () => void }) {
  const { t } = useI18n();
  return <ErrorRecovery title={t('이 화면')} onRetry={retry} />;
}
