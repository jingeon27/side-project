'use client';

import type { ComponentProps } from 'react';

import { Button, cn, BottomSheet as DesignSystemBottomSheet } from '@side/design-system';

import { useI18n } from '@/shared/i18n';

type TBottomSheetProps = Omit<
  ComponentProps<typeof DesignSystemBottomSheet>,
  'closeLabel' | 'resizeLabel' | 'showCloseButton' | 'responsive'
>;

export function BottomSheet({
  title,
  onOpenChange,
  footer,
  className,
  dismissible = true,
  ...props
}: TBottomSheetProps) {
  const { t } = useI18n();
  return (
    <DesignSystemBottomSheet
      {...props}
      onOpenChange={onOpenChange}
      title={title}
      dismissible={dismissible}
      responsive
      showCloseButton={false}
      footer={
        footer ??
        (dismissible ? (
          <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
            {t('닫기')}
          </Button>
        ) : null)
      }
      closeLabel={t('닫기')}
      resizeLabel={t('시트 높이 조절')}
      className={cn('bottom-sheet-content', className)}
    />
  );
}
