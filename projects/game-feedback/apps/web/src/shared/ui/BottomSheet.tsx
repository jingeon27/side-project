'use client';

import type { ComponentProps } from 'react';
import { Dialog } from '@side/design-system';
import { useI18n } from '@/shared/i18n';

type TBottomSheetProps = Omit<ComponentProps<typeof Dialog>, 'placement' | 'closeLabel' | 'className'>;

export function BottomSheet({ title, ...props }: TBottomSheetProps) {
  const { t } = useI18n();
  return (
    <Dialog
      {...props}
      title={t(title)}
      placement="bottom"
      closeLabel={t('닫기')}
      className="bottom-sheet-content"
    />
  );
}
