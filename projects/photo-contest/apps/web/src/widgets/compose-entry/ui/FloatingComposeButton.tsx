'use client';

import { useEffect, useRef, useState } from 'react';

import { FloatingActionButton, type IFloatingActionButtonProps } from '@side/design-system';

import { cn } from '@/shared/lib/cn.helper';
import { useIsSSR } from '@/shared/model/is-ssr.hook';

interface IFloatingComposeButtonProps extends Pick<
  IFloatingActionButtonProps,
  'label' | 'onClick' | 'aria-haspopup'
> {
  aboveBottomNav?: boolean;
}

export function FloatingComposeButton({
  label,
  aboveBottomNav = false,
  ...props
}: IFloatingComposeButtonProps) {
  const isSSR = useIsSSR();
  const [isScrolling, setIsScrolling] = useState(false);
  const idleTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const restoreLabel = () => {
      clearTimeout(idleTimeout.current);
      idleTimeout.current = setTimeout(() => setIsScrolling(false), 180);
    };
    const handleScroll = () => {
      setIsScrolling(true);
      restoreLabel();
    };
    restoreLabel();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(idleTimeout.current);
    };
  }, []);

  return (
    <FloatingActionButton
      {...props}
      label={label}
      variant="gradient"
      disabled={isSSR}
      compact={isScrolling}
      data-compose-entry
      data-compose-above-nav={aboveBottomNav || undefined}
      className={cn(
        'fixed right-4 z-sticky-cta desktop:right-8 desktop:bottom-[calc(32px+var(--safe-bottom))] keyboard-open:invisible',
        aboveBottomNav
          ? 'bottom-[calc(var(--spacing-bottom-nav)+16px+var(--safe-bottom))]'
          : 'bottom-[calc(24px+var(--safe-bottom))]',
      )}
    />
  );
}
