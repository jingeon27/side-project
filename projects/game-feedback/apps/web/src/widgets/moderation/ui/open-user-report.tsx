'use client';

import { openOverlay } from '@/shared/ui';

import { ReportDialog } from './ReportDialog';

export function openUserReport(userId: string, overlayId?: string) {
  return openOverlay(
    ({ isOpen, close, unmount }) => (
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
    ),
    overlayId ? { overlayId } : undefined,
  );
}
