'use client';

import { useCallback } from 'react';

export function useActiveItemScroll() {
  return useCallback((node: HTMLDivElement | null) => {
    if (!node) return;

    const scrollItem = (active: HTMLElement) => {
      if (!node.clientWidth) return;
      const viewport = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const left = viewport.left + Number.parseFloat(style.paddingLeft);
      const right = viewport.right - Number.parseFloat(style.paddingRight);
      const item = active.getBoundingClientRect();
      if (item.left < left) {
        node.scrollBy({ left: item.left - left, behavior: 'instant' });
        return;
      }
      if (item.right > right) {
        node.scrollBy({ left: item.right - right, behavior: 'instant' });
      }
    };

    const scrollActiveItem = () => {
      const active = node.querySelector<HTMLElement>('[aria-current="page"], [aria-selected="true"]');
      if (active) scrollItem(active);
    };
    function handleFocus(event: FocusEvent) {
      if (event.target instanceof HTMLElement) scrollItem(event.target);
    }

    scrollActiveItem();
    node.addEventListener('focusin', handleFocus);
    const resize = new ResizeObserver(scrollActiveItem);
    const selection = new MutationObserver(scrollActiveItem);
    resize.observe(node);
    selection.observe(node, {
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-current', 'aria-selected'],
    });
    return () => {
      node.removeEventListener('focusin', handleFocus);
      resize.disconnect();
      selection.disconnect();
    };
  }, []);
}
