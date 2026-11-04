'use client';

import { useTransition, type ReactNode } from 'react';

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
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={variant}
      size={size}
      loading={pending}
      onClick={() => {
        trackEvent(ANALYTICS_EVENT.GroupSearchCleared, { placement });
        const { pathname, search, hash } = window.location;
        startTransition(() => router.replace(`${pathname}${updateSearch(search, { q: null })}${hash}`));
      }}
    >
      {children}
    </Button>
  );
}
