'use client';
import type { ReactNode } from 'react';
import { Dialog } from '@side/design-system';
import { useI18n } from '@/shared/i18n';

interface IModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  dismissible?: boolean;
}
export function Modal({ open, onOpenChange, title, description, children, dismissible = true }: IModalProps) {
  const { t } = useI18n();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(title)}
      description={t(description)}
      dismissible={dismissible}
      closeLabel={t('닫기')}
      className="dialog-content"
    >
      {children}
    </Dialog>
  );
}
