'use client';

import { Flag } from 'lucide-react';

import type { ReportInput } from '@game-feedback/contracts';

import { useSession } from '@/features/auth';
import { useI18n } from '@/shared/i18n';
import { openOverlay } from '@/shared/ui';
import { ReportDialog } from '@/widgets/moderation';

interface IReportContentButtonProps {
  targetType: ReportInput['targetType'];
  targetId: string;
}

export function ReportContentButton({ targetType, targetId }: IReportContentButtonProps) {
  const { t } = useI18n();
  const { session, requireLogin } = useSession();
  const handleReport = () => {
    if (!session.user) {
      requireLogin();
      return;
    }
    openOverlay((control) => <ReportDialog {...control} targetType={targetType} targetId={targetId} />);
  };
  return (
    <button type="button" className="text-action" onClick={handleReport}>
      <Flag size={13} />
      {t('신고')}
    </button>
  );
}
