'use client';

import { useEffect, useEffectEvent, useState, useTransition, type ReactNode } from 'react';

import { Mutex } from 'es-toolkit';
import { RefreshCw } from 'lucide-react';
import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useSpring } from 'motion/react';

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
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const [refreshMutex] = useState(() => new Mutex());
  const pullDistance = useMotionValue(0);
  const springDistance = useSpring(pullDistance, { stiffness: 400, damping: 40 });
  const reducedMotion = useReducedMotion();
  const [distance, setDistance] = useState(0);
  const [pending, startTransition] = useTransition();
  useMotionValueEvent(pullDistance, 'change', setDistance);

  const handleRefresh = () => {
    if (refreshMutex.isLocked) return;
    const acquired = refreshMutex.acquire();
    pullDistance.set(REFRESH_DISTANCE);
    startTransition(async () => {
      try {
        await acquired;
        if (!target?.isConnected) return;
        await onRefresh();
      } catch {
        /* 각 조회의 오류 경계가 재시도를 제공한다. */
      } finally {
        refreshMutex.release();
        if (target?.isConnected) pullDistance.set(0);
      }
    });
  };
  const refreshFromGesture = useEffectEvent(() => handleRefresh());

  useEffect(() => {
    if (!target) return;
    const lifetime = new AbortController();
    const start = (event: TouchEvent) => {
      if (refreshMutex.isLocked || event.touches.length !== 1 || window.scrollY > 0) return;
      const origin = event.touches[0];
      if (!origin || !(event.target instanceof Element)) return;
      if (event.target.closest('input, textarea, select, button, a, video, [contenteditable="true"]')) return;
      const hasScrolledAncestor = (ancestor: Element | null): boolean => {
        if (!ancestor || ancestor === target) return false;
        if (ancestor.scrollTop > 0) return true;
        return hasScrolledAncestor(ancestor.parentElement);
      };
      if (hasScrolledAncestor(event.target)) return;
      const session = new AbortController();
      const cancel = () => {
        session.abort();
        if (!refreshMutex.isLocked) pullDistance.set(0);
      };
      pullDistance.set(0);
      lifetime.signal.addEventListener('abort', cancel, { once: true, signal: session.signal });
      const move = (next: TouchEvent) => {
        const touch = next.touches[0];
        if (
          !touch ||
          next.touches.length !== 1 ||
          touch.identifier !== origin.identifier ||
          window.scrollY > 0
        ) {
          cancel();
          return;
        }
        const y = touch.clientY - origin.clientY;
        if (y <= 0 || Math.abs(touch.clientX - origin.clientX) > Math.max(y, 10)) {
          cancel();
          return;
        }
        if (next.cancelable) next.preventDefault();
        pullDistance.set(Math.min(MAX_PULL_DISTANCE, y / 2));
      };
      const end = () => {
        session.abort();
        if (pullDistance.get() >= REFRESH_DISTANCE) {
          refreshFromGesture();
          return;
        }
        pullDistance.set(0);
      };
      // Motion pan은 세로 touch-action 제한이 필요하다. 기본 스크롤·핀치를 보존하려고 유효한 당기기만 중재한다.
      target.addEventListener('touchmove', move, { passive: false, signal: session.signal });
      target.addEventListener('touchend', end, { signal: session.signal });
      target.addEventListener('touchcancel', cancel, { signal: session.signal });
      target.addEventListener('touchstart', cancel, { signal: session.signal });
    };
    target.addEventListener('touchstart', start, { passive: true, signal: lifetime.signal });
    return () => lifetime.abort();
  }, [target, pullDistance, refreshMutex]);

  return (
    <div ref={setTarget} className="min-w-0" aria-busy={pending}>
      <button
        type="button"
        className="sr-only rounded-control text-button text-ink focus:not-sr-only focus:mb-4 focus:min-h-touch focus:px-4"
        disabled={pending}
        onClick={handleRefresh}
      >
        피드 새로고침
      </button>
      <motion.div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 overflow-hidden text-caption text-muted"
        style={{ height: reducedMotion ? pullDistance : springDistance }}
      >
        {distance > 0 ? (
          <>
            <RefreshCw aria-hidden className={cn('size-4', pending && !reducedMotion && 'animate-spin')} />
            {pending
              ? '새로고침 중'
              : distance >= REFRESH_DISTANCE
                ? '놓으면 새로고침'
                : '아래로 당겨 새로고침'}
          </>
        ) : null}
      </motion.div>
      {children}
    </div>
  );
}
