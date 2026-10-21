'use client';

import { useTransition, type ReactNode } from 'react';

import { AlertDialog } from '@base-ui/react/alert-dialog';

import { dialogStyles } from '@side/design-system';

import { cn } from '../../../lib/cn.helper';
import { getOverlayContainer } from '../../../lib/overlay-container.helper';
import type { IOverlayControlProps } from '../../../lib/overlay.type';
import { useOverlayHistory } from '../../../model/router';
import { Button } from '../button';

export interface IConfirmDialogProps extends IOverlayControlProps {
  title: string;
  description?: ReactNode;
  /** 확인 버튼 글자. "확인" 대신 행동을 쓴다(예: 사진 삭제하기). */
  confirmLabel: string;
  cancelLabel?: string;
  /** danger면 되돌릴 수 없는 행동으로 보여 준다. */
  tone?: 'default' | 'danger';
  /**
   * 확인을 누르면 부른다. Promise면 끝날 때까지 버튼을 잠그고 성공하면 닫는다.
   * 실패하면 다시 시도할 수 있게 열어 둔다(실패 안내는 ErrorLink나 부른 쪽이 한다).
   */
  onConfirm: () => unknown;
}

/** 삭제·링크 재발급처럼 되돌리기 어려운 행동을 한 번 더 묻는다. 처음 포커스는 취소 버튼에 간다. */
export function ConfirmDialog({
  isOpen,
  onClose,
  unmount,
  title,
  description,
  confirmLabel,
  cancelLabel = '취소',
  tone = 'default',
  onConfirm,
}: IConfirmDialogProps) {
  const [isPending, startTransition] = useTransition();
  useOverlayHistory(isOpen, onClose);

  const handleConfirm = () =>
    startTransition(async () => {
      try {
        await onConfirm();
        onClose();
      } catch {
        // 실패 안내는 이미 했다. 대화상자를 열어 두어 다시 시도하거나 취소하게 한다.
      }
    });

  return (
    <AlertDialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isPending) onClose();
      }}
      onOpenChangeComplete={(open) => {
        if (!open) unmount?.();
      }}
    >
      <AlertDialog.Portal container={getOverlayContainer()}>
        <AlertDialog.Backdrop className={dialogStyles.backdrop} />
        <AlertDialog.Viewport className={dialogStyles.viewport}>
          <AlertDialog.Popup className={cn(dialogStyles.popup, 'max-w-sm')}>
            <AlertDialog.Title className={dialogStyles.title}>{title}</AlertDialog.Title>
            {description ? (
              <AlertDialog.Description className={dialogStyles.description}>
                {description}
              </AlertDialog.Description>
            ) : null}
            <div className="mt-6 flex gap-2">
              <AlertDialog.Close
                render={
                  <Button variant="secondary" size="lg" fullWidth className="flex-1" disabled={isPending} />
                }
              >
                {cancelLabel}
              </AlertDialog.Close>
              <Button
                variant={tone === 'danger' ? 'danger' : 'primary'}
                size="lg"
                fullWidth
                className="flex-1"
                loading={isPending}
                onClick={handleConfirm}
              >
                {confirmLabel}
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
