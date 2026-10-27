// Adapted from shadcn/ui base-nova. See SHADCN.md for source and license.
'use client';

import type { ComponentProps } from 'react';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';

import { cn } from '../../lib/cn.helper';
import type { TStyledProps } from '../../lib/styled-props';
import { Button } from '../button/Button';
import { dialogStyles } from './dialog.styles';

export function DialogRoot(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}
export function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}
export function DialogPortal(props: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}
export function DialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}
export function DialogOverlay({ className, ...props }: TStyledProps<DialogPrimitive.Backdrop.Props>) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(dialogStyles.backdrop, className)}
      {...props}
    />
  );
}
type TDialogContentProps = TStyledProps<DialogPrimitive.Popup.Props> & {
  container?: ComponentProps<typeof DialogPortal>['container'];
  showCloseButton?: boolean;
  closeLabel?: string;
};
export function DialogContent({
  className,
  children,
  container,
  showCloseButton = true,
  closeLabel = '닫기',
  ...props
}: TDialogContentProps) {
  return (
    <DialogPortal container={container}>
      <DialogOverlay />
      <DialogPrimitive.Viewport className={dialogStyles.viewport}>
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          className={cn(
            dialogStyles.popup,
            'border border-border bg-popover text-popover-foreground',
            className,
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogClose render={<Button variant="ghost" size="icon" className="absolute top-3 right-3" />}>
              <XIcon aria-hidden="true" />
              <span className="sr-only">{closeLabel}</span>
            </DialogClose>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPortal>
  );
}
export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('flex flex-col gap-2', className)} {...props} />;
}
export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('mt-5 flex flex-col-reverse gap-2 pc:flex-row pc:justify-end', className)}
      {...props}
    />
  );
}
export function DialogTitle({ className, ...props }: TStyledProps<DialogPrimitive.Title.Props>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(dialogStyles.title, className)}
      {...props}
    />
  );
}
export function DialogDescription({ className, ...props }: TStyledProps<DialogPrimitive.Description.Props>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-body text-muted-foreground', className)}
      {...props}
    />
  );
}
