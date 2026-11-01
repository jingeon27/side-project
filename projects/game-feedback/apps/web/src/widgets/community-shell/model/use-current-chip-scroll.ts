'use client';

import { useCallback } from 'react';

import { useRouteViewportHorizontalScroll } from '@/shared/navigation';

export function useCurrentChipScroll(scopeKey: string) {
  const position = useRouteViewportHorizontalScroll();
  return useCallback(
    (chip: HTMLAnchorElement | null) => {
      const container = chip?.parentElement;
      if (!chip || !container) return;

      const handleScroll = () => {
        if (!container.isConnected || !container.clientWidth) return;
        position.current = { scopeKey, left: container.scrollLeft };
      };
      const handleVisible = (target: HTMLAnchorElement) => {
        if (!container.clientWidth) return;
        const viewport = container.getBoundingClientRect();
        const style = getComputedStyle(container);
        const left = viewport.left + Number.parseFloat(style.paddingLeft);
        const right = viewport.right - Number.parseFloat(style.paddingRight);
        const item = target.getBoundingClientRect();
        if (item.left < left) {
          container.scrollBy({ left: item.left - left, behavior: 'instant' });
          handleScroll();
          return;
        }
        if (item.right > right) {
          container.scrollBy({ left: item.right - right, behavior: 'instant' });
        }
        handleScroll();
      };
      const handleCurrentVisible = () => {
        if (!container.clientWidth) return;
        const remembered = position.current;
        if (remembered?.scopeKey === scopeKey)
          container.scrollTo({ left: remembered.left, behavior: 'instant' });
        handleVisible(chip);
      };
      const handleFocus = (event: FocusEvent) => {
        if (event.target instanceof HTMLAnchorElement && event.target.parentElement === container)
          handleVisible(event.target);
      };

      handleCurrentVisible();
      container.addEventListener('scroll', handleScroll, { passive: true });
      container.addEventListener('focusin', handleFocus);
      const resize = new ResizeObserver(handleCurrentVisible);
      resize.observe(container);
      resize.observe(chip);
      return () => {
        container.removeEventListener('scroll', handleScroll);
        container.removeEventListener('focusin', handleFocus);
        resize.disconnect();
      };
    },
    [position, scopeKey],
  );
}
