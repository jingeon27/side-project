'use client';

import type { ReactNode } from 'react';

import { useI18n } from '@/shared/i18n';

import { BottomSheet } from './BottomSheet';

interface IModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  dismissible?: boolean;
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  dismissible = true,
}: IModalProps) {
  const { t } = useI18n();
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t(title)}
      description={t(description)}
      dismissible={dismissible}
      footer={footer}
    >
      {children}
    </BottomSheet>
  );
}
