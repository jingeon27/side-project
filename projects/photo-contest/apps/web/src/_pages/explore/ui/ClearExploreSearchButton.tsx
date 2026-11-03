'use client';

import { useTransition, type ReactNode } from 'react';

import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { useAppRouter } from '@/shared/model/router';
import { Button, type IButtonProps } from '@/shared/ui/@core/button';

export function ClearExploreSearchButton({
  placement,
  variant,
  size,
  children,
}: Pick<IButtonProps, 'variant' | 'size'> & {
  placement: 'results_header' | 'empty_state';
  children: ReactNode;
}) {
  const router = useAppRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={variant}
      size={size}
      loading={pending}
      onClick={() => {
        trackEvent(ANALYTICS_EVENT.GroupSearchCleared, { placement });
        const url = new URL(window.location.href);
        url.searchParams.delete('q');
        startTransition(() => router.replace(`${url.pathname}${url.search}${url.hash}`));
      }}
    >
      {children}
    </Button>
  );
}
