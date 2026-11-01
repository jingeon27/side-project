'use client';

import { FloatingActionButton } from '@side/design-system';

import { useI18n } from '@/shared/i18n';
import { useIsScrolling } from '@/shared/lib/use-is-scrolling';

interface IFloatingComposeButtonProps {
  onCompose: () => void;
}

export function FloatingComposeButton({ onCompose }: IFloatingComposeButtonProps) {
  const { t } = useI18n();
  const scrolling = useIsScrolling();

  return (
    <FloatingActionButton
      label={t('글쓰기')}
      compact={scrolling}
      className="floating-compose-button fixed"
      data-scrolling={scrolling || undefined}
      onClick={onCompose}
    />
  );
}
