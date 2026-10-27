'use client';

import type { ComponentProps, ReactNode } from 'react';

import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from './DialogParts';

export interface IDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  dismissible?: boolean;
  /** 닫기 버튼 이름. 번역은 소비 앱이 맡고 패키지는 기본값을 두지 않는다. */
  closeLabel: string;
  container?: ComponentProps<typeof DialogPortal>['container'];
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
  closeLabel,
  container,
  onOpenChangeComplete,
  className,
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
        {...(dismissible ? { closeLabel } : { showCloseButton: false })}
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
