'use client';

import type { ReactNode } from 'react';

import { updateSearch } from '@/shared/lib/query-string.helper';
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
  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => {
        trackEvent(ANALYTICS_EVENT.GroupSearchCleared, { placement });
        router.replace(
          `${window.location.pathname}${updateSearch(window.location.search, { q: null })}${window.location.hash}`,
        );
      }}
    >
      {children}
    </Button>
  );
}
