'use client';

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from 'react';

import { Mutex } from 'es-toolkit';
import { RefreshCw } from 'lucide-react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';

import { Spinner } from '../spinner/Spinner';

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
  const subscribeToDistance = useCallback(
    (onChange: () => void) => pullDistance.on('change', onChange),
    [pullDistance],
  );
  const phase = useSyncExternalStore(
    subscribeToDistance,
    () => {
      const distance = pullDistance.get();
      if (distance === 0) return 'idle';
      return distance >= REFRESH_DISTANCE ? 'ready' : 'pulling';
    },
    () => 'idle',
  );
  const [pending, startTransition] = useTransition();

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
  const handleRefreshFromGesture = useEffectEvent(handleRefresh);

  useEffect(() => {
    if (!target) return;
    const lifetime = new AbortController();
    const handleTouchStart = (event: TouchEvent) => {
      if (refreshMutex.isLocked || event.touches.length !== 1 || window.scrollY > 0) return;
      const origin = event.touches[0];
      if (!origin) return;
      const path = event.composedPath();
      if (
        path
          .slice(0, path.indexOf(target))
          .some(
            (node) =>
              node instanceof Element &&
              (node.scrollTop > 0 ||
                node.matches('input, textarea, select, button, a, video, [contenteditable="true"]')),
          )
      )
        return;
      const session = new AbortController();
      const handleSettle = (next: Event) => {
        session.abort();
        if (refreshMutex.isLocked) return;
        if (next.type === 'touchend' && pullDistance.get() >= REFRESH_DISTANCE) {
          handleRefreshFromGesture();
          return;
        }
        pullDistance.set(0);
      };
      pullDistance.set(0);
      lifetime.signal.addEventListener('abort', handleSettle, { once: true, signal: session.signal });
      const handleTouchMove = (next: TouchEvent) => {
        const touch = next.touches[0];
        if (
          !touch ||
          next.touches.length !== 1 ||
          touch.identifier !== origin.identifier ||
          window.scrollY > 0
        ) {
          handleSettle(next);
          return;
        }
        const y = touch.clientY - origin.clientY;
        if (y <= 0 || Math.abs(touch.clientX - origin.clientX) > Math.max(y, 10)) {
          handleSettle(next);
          return;
        }
        if (next.cancelable) next.preventDefault();
        pullDistance.set(Math.min(MAX_PULL_DISTANCE, y / 2));
      };
      // Motion pan은 세로 touch-action 제한이 필요하다. 기본 스크롤·핀치를 보존하려고 유효한 당기기만 중재한다.
      target.addEventListener('touchmove', handleTouchMove, { passive: false, signal: session.signal });
      for (const type of ['touchend', 'touchcancel', 'touchstart']) {
        target.addEventListener(type, handleSettle, { signal: session.signal });
      }
    };
    target.addEventListener('touchstart', handleTouchStart, { passive: true, signal: lifetime.signal });
    return () => lifetime.abort();
  }, [target, pullDistance, refreshMutex]);

  return (
    <div ref={setTarget} className="min-w-0" aria-busy={pending}>
      <button
        type="button"
        className="sr-only rounded-control text-button text-ink focus:not-sr-only focus:mb-4 focus:min-h-touch focus:px-4"
        aria-disabled={pending}
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
        {phase !== 'idle' ? (
          <>
            {pending ? <Spinner className="size-4" /> : <RefreshCw aria-hidden className="size-4" />}
            {pending ? '새로고침 중' : phase === 'ready' ? '놓으면 새로고침' : '아래로 당겨 새로고침'}
          </>
        ) : null}
      </motion.div>
      {children}
    </div>
  );
}
