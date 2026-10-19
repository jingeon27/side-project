'use client';

import type { ComponentProps, ReactNode } from 'react';
import {
  DialogRoot,
  DialogPortal,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './DialogParts';

export interface IDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  dismissible?: boolean;
  closeLabel?: string;
  container?: ComponentProps<typeof DialogPortal>['container'];
  onOpenChangeComplete?: (open: boolean) => void;
  className?: string;
  placement?: 'center' | 'bottom';
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
  placement = 'center',
}: IDialogProps) {
  return (
    <DialogRoot
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
      <DialogContent
        container={container}
        className={className}
        showCloseButton={dismissible}
        closeLabel={closeLabel}
        placement={placement}
      >
        <DialogHeader className={dismissible ? 'pr-12' : undefined}>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="mt-5">{children}</div>
      </DialogContent>
    </DialogRoot>
  );
}
