'use client';

import { useEffect, useRef, useState } from 'react';

import { Plus } from 'lucide-react';

import { cn } from '@/shared/lib/cn.helper';
import { Button, ButtonLink, type IButtonProps } from '@/shared/ui/@core/button';

interface IFloatingComposeButtonProps extends Pick<IButtonProps, 'onClick' | 'aria-haspopup'> {
  label: string;
  aboveBottomNav?: boolean;
  href?: string;
}

export function FloatingComposeButton({
  label,
  aboveBottomNav = false,
  href,
  ...props
}: IFloatingComposeButtonProps) {
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

  const className = cn(
    'group/compose-entry fixed right-4 z-sticky-cta h-14 w-32 gap-0 rounded-full px-0 shadow-toast transition-[width,background-color,transform] duration-200 data-[compact=true]:w-14 focus-visible:w-32 desktop:right-8 desktop:bottom-[calc(32px+var(--safe-bottom))] motion-reduce:transition-none keyboard-open:invisible',
    aboveBottomNav
      ? 'bottom-[calc(var(--spacing-bottom-nav)+16px+var(--safe-bottom))]'
      : 'bottom-[calc(24px+var(--safe-bottom))]',
  );
  const attributes = {
    'aria-label': label,
    'data-compose-entry': true,
    'data-compose-above-nav': aboveBottomNav || undefined,
    'data-compact': isScrolling,
    className,
  };
  const content = (
    <>
      <Plus aria-hidden className="size-5" />
      <span
        aria-hidden
        className="max-w-20 overflow-hidden pl-2 opacity-100 transition-[max-width,padding,opacity] duration-200 group-data-[compact=true]/compose-entry:max-w-0 group-data-[compact=true]/compose-entry:pl-0 group-data-[compact=true]/compose-entry:opacity-0 group-focus-visible/compose-entry:max-w-20 group-focus-visible/compose-entry:pl-2 group-focus-visible/compose-entry:opacity-100 motion-reduce:transition-none"
      >
        {label}
      </span>
    </>
  );

  if (href)
    return (
      <ButtonLink {...attributes} href={href} variant="accent" size="lg">
        {content}
      </ButtonLink>
    );
  return (
    <Button {...attributes} {...props} variant="accent" size="lg">
      {content}
    </Button>
  );
}
