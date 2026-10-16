'use client';
import type { ReactNode } from 'react';
import { Dialog } from '@side/design-system';

interface IModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  dismissible?: boolean;
}
export function Modal({ open, onOpenChange, title, description, children, dismissible = true }: IModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      dismissible={dismissible}
      className="dialog-content"
    >
      {children}
    </Dialog>
  );
}
