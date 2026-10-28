'use client';

import type { FC } from 'react';
import { catchError } from 'next/error';

import { overlay } from 'overlay-kit';

import { Button } from '@side/design-system';

import { useI18n } from '@/shared/i18n';

import { BottomSheet } from './BottomSheet';
import { ErrorRecovery } from './ErrorRecovery';

/**
 * openOverlay가 시트·대화상자에 그대로 펼쳐 넘기는 열림 제어.
 * `onOpenChange(false)`는 닫기 전환을 시작하고, `onOpenChangeComplete(false)`가 전환이 끝난 뒤 overlay를 제거한다.
 */
export interface IOverlayControlProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenChangeComplete?: (open: boolean) => void;
}

const OverlayErrorBoundary = catchError(function OverlayErrorFallback(
  { open, onOpenChange, onOpenChangeComplete }: IOverlayControlProps,
  { reset: onReset },
) {
  const { t } = useI18n();
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      title={t('창을 불러오지 못했어요')}
      description={t('다시 시도하거나 창을 닫고 다른 기능을 이용할 수 있어요.')}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
            {t('닫기')}
          </Button>
          <Button type="button" onClick={onReset}>
            {t('다시 시도하기')}
          </Button>
        </>
      }
    >
      <ErrorRecovery title={t('이 창')} onRetry={onReset} showRetry={false} />
    </BottomSheet>
  );
});

/** Portals remain children of OverlayProvider, so each controller needs its own boundary. */
export function openOverlay(
  Controller: FC<IOverlayControlProps>,
  options?: Parameters<typeof overlay.open>[1],
) {
  return overlay.open(({ isOpen, close, unmount }) => {
    const control = {
      open: isOpen,
      onOpenChange: (next: boolean) => {
        if (!next) close();
      },
      // 닫기 전환(시트 250ms)이 끝난 뒤에 제거해야 닫히는 모습이 보인다.
      onOpenChangeComplete: (next: boolean) => {
        if (!next) unmount();
      },
    } satisfies IOverlayControlProps;
    return (
      <OverlayErrorBoundary {...control}>
        <Controller {...control} />
      </OverlayErrorBoundary>
    );
  }, options);
}
