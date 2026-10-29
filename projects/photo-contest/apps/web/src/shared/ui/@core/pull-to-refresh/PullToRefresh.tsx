'use client';

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';

import { RefreshCw } from 'lucide-react';

import { cn } from '../../../lib/cn.helper';

const REFRESH_DISTANCE = 64;
const MAX_PULL_DISTANCE = 96;

export function PullToRefresh({
  children,
  onRefresh,
}: {
  children: ReactNode;
  onRefresh: () => Promise<unknown>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef({ x: 0, y: 0, distance: 0, tracking: false, refreshing: false });
  const [distance, setDistance] = useState(0);
  const [pending, startTransition] = useTransition();

  const handleRefresh = useCallback(() => {
    if (gesture.current.refreshing) return;
    gesture.current.refreshing = true;
    gesture.current.tracking = false;
    setDistance(REFRESH_DISTANCE);
    startTransition(async () => {
      try {
        await onRefresh();
      } catch {
        /* 각 조회의 오류 경계가 재시도를 제공한다. */
      } finally {
        gesture.current.refreshing = false;
        gesture.current.distance = 0;
        setDistance(0);
      }
    });
  }, [onRefresh]);

  const refreshFromGesture = useEffectEvent(() => handleRefresh());

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const cancel = () => {
      gesture.current.tracking = false;
      gesture.current.distance = 0;
      if (!gesture.current.refreshing) setDistance(0);
    };
    const start = (event: TouchEvent) => {
      if (gesture.current.refreshing) return;
      cancel();
      const touch = event.touches[0];
      if (!touch || event.touches.length !== 1 || window.scrollY > 0) return;
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('input, textarea, select, button, video, [contenteditable="true"]')) return;
      const hasScrolledAncestor = (ancestor: Element | null): boolean => {
        if (!ancestor || ancestor === element) return false;
        if (ancestor.scrollTop > 0) return true;
        return hasScrolledAncestor(ancestor.parentElement);
      };
      if (hasScrolledAncestor(event.target)) return;
      gesture.current = { ...gesture.current, x: touch.clientX, y: touch.clientY, tracking: true };
    };
    const move = (event: TouchEvent) => {
      if (!gesture.current.tracking) return;
      const touch = event.touches[0];
      if (!touch || event.touches.length !== 1 || window.scrollY > 0) {
        cancel();
        return;
      }
      const deltaY = touch.clientY - gesture.current.y;
      if (Math.abs(touch.clientX - gesture.current.x) > Math.max(deltaY, 10)) {
        cancel();
        return;
      }
      if (deltaY <= 0) {
        cancel();
        return;
      }
      if (event.cancelable) event.preventDefault();
      gesture.current.distance = Math.min(MAX_PULL_DISTANCE, deltaY / 2);
      setDistance(gesture.current.distance);
    };
    const end = () => {
      if (!gesture.current.tracking) return;
      if (gesture.current.distance >= REFRESH_DISTANCE) {
        refreshFromGesture();
        return;
      }
      cancel();
    };
    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('touchmove', move, { passive: false });
    element.addEventListener('touchend', end);
    element.addEventListener('touchcancel', cancel);
    return () => {
      element.removeEventListener('touchstart', start);
      element.removeEventListener('touchmove', move);
      element.removeEventListener('touchend', end);
      element.removeEventListener('touchcancel', cancel);
    };
  }, []);

  return (
    <div ref={root} className="min-w-0" aria-busy={pending}>
      <button
        type="button"
        className="sr-only rounded-control text-button text-ink focus:not-sr-only focus:mb-4 focus:min-h-touch focus:px-4"
        disabled={pending}
        onClick={handleRefresh}
      >
        피드 새로고침
      </button>
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 overflow-hidden text-caption text-muted"
        style={{ height: distance }}
      >
        {distance > 0 ? (
          <>
            <RefreshCw aria-hidden className={cn('size-4', pending && 'animate-spin')} />
            {pending
              ? '새로고침 중'
              : distance >= REFRESH_DISTANCE
                ? '놓으면 새로고침'
                : '아래로 당겨 새로고침'}
          </>
        ) : null}
      </div>
      {children}
    </div>
  );
}
