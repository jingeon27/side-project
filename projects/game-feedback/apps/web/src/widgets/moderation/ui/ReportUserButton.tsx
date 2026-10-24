'use client';

import { Button } from '@side/design-system';

import { useSession } from '@/features/auth';
import { useI18n } from '@/shared/i18n';

import { openUserReport } from './open-user-report';

export function ReportUserButton({ userId }: { userId: string }) {
  const { t } = useI18n();
  const { session, requireLogin } = useSession();
  if (session.user?.id === userId) return null;
  return (
    <Button
      variant="ghost"
      type="button"
      onClick={() => {
        if (!session.user) {
          requireLogin();
          return;
        }
        openUserReport(userId);
      }}
    >
      {t('사용자 신고')}
    </Button>
  );
}
