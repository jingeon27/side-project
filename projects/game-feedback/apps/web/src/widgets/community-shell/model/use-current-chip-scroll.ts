'use client';

import { useCallback } from 'react';

export function useCurrentChipScroll() {
  return useCallback((chip: HTMLAnchorElement | null) => {
    const container = chip?.parentElement;
    if (!chip || !container) return;

    const handleCurrentVisible = () => {
      if (!container.clientWidth) return;
      const viewport = container.getBoundingClientRect();
      const style = getComputedStyle(container);
      const left = viewport.left + Number.parseFloat(style.paddingLeft);
      const right = viewport.right - Number.parseFloat(style.paddingRight);
      const item = chip.getBoundingClientRect();
      if (item.left < left) {
        container.scrollBy({ left: item.left - left, behavior: 'instant' });
        return;
      }
      if (item.right > right) {
        container.scrollBy({ left: item.right - right, behavior: 'instant' });
      }
    };

    handleCurrentVisible();
    const resize = new ResizeObserver(handleCurrentVisible);
    resize.observe(container);
    resize.observe(chip);
    return () => resize.disconnect();
  }, []);
}
