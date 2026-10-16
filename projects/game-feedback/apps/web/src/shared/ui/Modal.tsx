'use client';
import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

interface IModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  dismissible?: boolean;
}
export function Modal({ open, onOpenChange, title, description, children, dismissible = true }: IModalProps) {
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && !dismissible) return;
    onOpenChange(nextOpen);
  }
  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          onEscapeKeyDown={(event) => {
            if (!dismissible) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (!dismissible) event.preventDefault();
          }}
        >
          <div className="dialog-heading">
            <Dialog.Title>{title}</Dialog.Title>
            {dismissible && (
              <Dialog.Close className="icon-button" aria-label="닫기">
                <X size={20} />
              </Dialog.Close>
            )}
          </div>
          <Dialog.Description className="dialog-description">{description}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
