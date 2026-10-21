'use client';

import type { ComponentProps } from 'react';
import { BottomSheet as DesignSystemBottomSheet } from '@side/design-system';
import { useI18n } from '@/shared/i18n';

type TBottomSheetProps = Omit<
  ComponentProps<typeof DesignSystemBottomSheet>,
  'closeLabel' | 'resizeLabel' | 'className'
>;

export function BottomSheet({ title, ...props }: TBottomSheetProps) {
  const { t } = useI18n();
  return (
    <DesignSystemBottomSheet
      {...props}
      title={t(title)}
      closeLabel={t('닫기')}
      resizeLabel={t('시트 높이 조절')}
      className="bottom-sheet-content"
    />
  );
}
