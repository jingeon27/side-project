'use client';

import { openOverlay } from '@/shared/ui';

import { ReportDialog } from './ReportDialog';

export function openUserReport(userId: string, overlayId?: string) {
  return openOverlay(
    (control) => <ReportDialog {...control} targetType="USER" targetId={userId} />,
    overlayId ? { overlayId } : undefined,
  );
}
