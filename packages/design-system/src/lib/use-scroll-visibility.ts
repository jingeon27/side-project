'use client';

import { useCallback, useState } from 'react';

import { scroll } from 'motion';

const HIDE_DISTANCE = 12;
const SHOW_DISTANCE = 8;
const ALWAYS_VISIBLE_TOP = 8;

interface IScrollVisibility {
  hidden: boolean;
  anchor: number;
}

function nextVisibility(previous: IScrollVisibility, top: number): IScrollVisibility {
  if (top <= ALWAYS_VISIBLE_TOP) return { hidden: false, anchor: top };
  const anchor = previous.hidden ? Math.max(previous.anchor, top) : Math.min(previous.anchor, top);
  const crossed = previous.hidden ? anchor - top >= SHOW_DISTANCE : top - anchor >= HIDE_DISTANCE;
  return crossed ? { hidden: !previous.hidden, anchor: top } : { hidden: previous.hidden, anchor };
}

/** 아래로 12px이면 숨고 위로 8px이면 표시한다. 연결한 DOM의 수명으로 구독을 정리한다. */
export function useScrollVisibility<TElement extends HTMLElement = HTMLElement>() {
  const [hidden, setHidden] = useState(false);
  const ref = useCallback((element: TElement | null) => {
    if (!element) return;
    const container = document.documentElement;
    const top = Math.max(0, Math.min(container.scrollTop, container.scrollHeight - container.clientHeight));
    const current = { value: { hidden: false, anchor: top } };
    setHidden(false);
    return scroll(
      (_progress, info) => {
        const top = Math.max(0, Math.min(info.y.current, info.y.scrollLength));
        const next = nextVisibility(current.value, top);
        const changed = next.hidden !== current.value.hidden;
        current.value = next;
        if (changed) setHidden(next.hidden);
      },
      { container },
    );
  }, []);
  return { ref, hidden };
}
