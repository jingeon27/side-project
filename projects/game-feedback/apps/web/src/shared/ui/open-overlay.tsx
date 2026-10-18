'use client';
import { catchError } from 'next/error';
import { Dialog } from '@side/design-system';
import { overlay, type OverlayControllerComponent } from 'overlay-kit';
import { ErrorRecovery } from './ErrorRecovery';

interface IOverlayErrorProps {
  open: boolean;
  onClose: () => void;
}

const OverlayErrorBoundary = catchError(function OverlayErrorFallback(
  { open, onClose }: IOverlayErrorProps,
  { reset },
) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="창을 불러오지 못했어요"
      description="다시 시도하거나 창을 닫고 다른 기능을 이용할 수 있어요."
    >
      <ErrorRecovery title="이 창" onRetry={reset} />
    </Dialog>
  );
});

/** Portals remain children of OverlayProvider, so each controller needs its own boundary. */
export function openOverlay(
  Controller: OverlayControllerComponent,
  options?: Parameters<typeof overlay.open>[1],
) {
  return overlay.open(
    (props) => (
      <OverlayErrorBoundary
        open={props.isOpen}
        onClose={() => {
          props.close();
          props.unmount();
        }}
      >
        <Controller {...props} />
      </OverlayErrorBoundary>
    ),
    options,
  );
}
