'use client';
import { Button } from '@side/design-system';
import { useSession } from '@/features/auth';
import { useI18n } from '@/shared/i18n';
import { openOverlay } from '@/shared/ui';
import { ReportDialog } from './ReportDialog';
export function ReportUserButton({ userId }: { userId: string }) {
  const { t } = useI18n();
  const { session, login } = useSession();
  if (session.user?.id === userId) return null;
  return (
    <Button
      variant="ghost"
      type="button"
      onClick={() => {
        if (!session.user) {
          login();
          return;
        }
        openOverlay(({ isOpen, close, unmount }) => (
          <ReportDialog
            open={isOpen}
            targetType="USER"
            targetId={userId}
            onOpenChange={(next) => {
              if (next) return;
              close();
              unmount();
            }}
          />
        ));
      }}
    >
      {t('사용자 신고')}
    </Button>
  );
}
