'use client';

import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/cn.helper';
import { IconButton } from '../icon-button/IconButton';
import { dialogStyles } from './dialog.styles';

export interface IDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  dismissible?: boolean;
  closeLabel?: string;
  container?: ComponentProps<typeof BaseDialog.Portal>['container'];
  onOpenChangeComplete?: (open: boolean) => void;
  className?: string;
}

/** 열림 상태와 업무 흐름은 앱이 소유하고 공통 UI는 포커스·접근성을 맡는다. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  dismissible = true,
  closeLabel = '닫기',
  container,
  onOpenChangeComplete,
  className,
}: IDialogProps) {
  return (
    <BaseDialog.Root
      open={open}
      disablePointerDismissal={!dismissible}
      onOpenChange={(nextOpen, eventDetails) => {
        if (!nextOpen && !dismissible) {
          eventDetails.cancel();
          return;
        }
        onOpenChange(nextOpen);
      }}
      onOpenChangeComplete={onOpenChangeComplete}
    >
      <BaseDialog.Portal container={container}>
        <BaseDialog.Backdrop className={dialogStyles.backdrop} />
        <BaseDialog.Viewport className={dialogStyles.viewport}>
          <BaseDialog.Popup className={cn(dialogStyles.popup, className)}>
            <div className={dismissible ? 'pr-12' : undefined}>
              <BaseDialog.Title className={dialogStyles.title}>{title}</BaseDialog.Title>
              {description ? (
                <BaseDialog.Description className={dialogStyles.description}>
                  {description}
                </BaseDialog.Description>
              ) : null}
            </div>
            {dismissible ? (
              <BaseDialog.Close render={<IconButton label={closeLabel} className="absolute top-3 right-3" />}>
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="size-5"
                >
                  <path d="m6 6 12 12M6 18 18 6" />
                </svg>
              </BaseDialog.Close>
            ) : null}
            <div className="mt-5">{children}</div>
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
