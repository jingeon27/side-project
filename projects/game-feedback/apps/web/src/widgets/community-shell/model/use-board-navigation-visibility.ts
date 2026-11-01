'use client';

import { useCallback, useState } from 'react';

interface IScrollVisibility {
  hidden: boolean;
  anchor: number;
}

function scrollVisibility(previous: IScrollVisibility, top: number): IScrollVisibility {
  if (top <= 8) return { hidden: false, anchor: top };
  const anchor = previous.hidden ? Math.max(previous.anchor, top) : Math.min(previous.anchor, top);
  const crossed = previous.hidden ? anchor - top >= 8 : top - anchor >= 12;
  return crossed ? { hidden: !previous.hidden, anchor: top } : { hidden: previous.hidden, anchor };
}

export function useBoardNavigationVisibility() {
  const [hidden, setHidden] = useState(false);
  const ref = useCallback((navigation: HTMLDivElement | null) => {
    if (!navigation) return;
    const position = () =>
      Math.max(0, Math.min(window.scrollY, document.documentElement.scrollHeight - window.innerHeight));
    const current = { value: { hidden: false, anchor: position() } };
    setHidden(false);
    const handleScroll = () => {
      const next = scrollVisibility(current.value, position());
      const changed = next.hidden !== current.value.hidden;
      current.value = next;
      if (changed) setHidden(next.hidden);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  return { ref, hidden };
}
