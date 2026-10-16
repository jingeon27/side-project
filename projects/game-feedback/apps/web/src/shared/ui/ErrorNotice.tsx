'use client';
import { useI18n } from '@/shared/i18n';
export function ErrorNotice({ message }: { message?: string }) {
  const { t } = useI18n();
  return message ? (
    <div role="alert" className="error-notice">
      {t(message)}
    </div>
  ) : null;
}
