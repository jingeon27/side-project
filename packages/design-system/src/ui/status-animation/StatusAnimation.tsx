'use client';

import { useCallback, type ComponentType, type ReactNode } from 'react';

import { Cat, CircleAlert, CircleCheck, Gamepad2, Inbox, LoaderCircle, WifiOff } from 'lucide-react';

import { cn } from '../../lib/cn.helper';
import type { TMotionVariant } from './motion-assets';

const GLYPHS = {
  loading: LoaderCircle,
  success: CircleCheck,
  error: CircleAlert,
  empty: Inbox,
  offline: WifiOff,
  game: Gamepad2,
  cat: Cat,
} satisfies Record<TMotionVariant, ComponentType<{ className?: string }>>;

export interface IStatusAnimationProps {
  variant: TMotionVariant;
  className?: string;
  /** 의미 있는 그림에만 이름을 준다. 주변 글자와 같은 의미면 장식으로 둔다. */
  label?: string;
  loop?: boolean;
  fallback?: ReactNode;
}

/** 첫 HTML과 모션 줄이기에는 정지 그림을 유지한다. 플레이어는 브라우저에서 지연 로드한다. */
export function StatusAnimation({
  variant,
  className,
  label,
  fallback,
  loop = variant === 'loading' || variant === 'cat',
}: IStatusAnimationProps) {
  const Glyph = GLYPHS[variant];
  const attachPlayer = useCallback(
    (node: HTMLSpanElement | null) => {
      if (!node) return;
      node.removeAttribute('data-motion-ready');
      if (typeof window.matchMedia !== 'function') return;
      const lifetime = new AbortController();
      const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
      const mountPlayer = async (playback: AbortController) => {
        try {
          const [{ default: lottie }, { MOTION_ANIMATIONS }] = await Promise.all([
            import('lottie-web/build/player/lottie_light'),
            import('./motion-assets'),
          ]);
          if (playback.signal.aborted) return;
          const player = lottie.loadAnimation({
            container: node,
            renderer: 'svg',
            autoplay: false,
            loop,
            animationData: structuredClone(MOTION_ANIMATIONS[variant]),
            rendererSettings: { className: 'size-full', preserveAspectRatio: 'xMidYMid meet' },
          });
          const synchronize = (visible: boolean) => {
            if (playback.signal.aborted || !player.isLoaded) return;
            node.toggleAttribute('data-motion-ready', true);
            if (document.hidden || !visible) {
              player.pause();
              return;
            }
            player.play();
          };
          const handleVisibility = () => {
            if (playback.signal.aborted) return;
            const bounds = node.getBoundingClientRect();
            synchronize(
              bounds.bottom > 0 &&
                bounds.top < window.innerHeight &&
                bounds.right > 0 &&
                bounds.left < window.innerWidth,
            );
          };
          const handleFailure = () => playback.abort();
          playback.signal.addEventListener(
            'abort',
            () => {
              node.removeAttribute('data-motion-ready');
              document.removeEventListener('visibilitychange', handleVisibility);
              player.removeEventListener('DOMLoaded', handleVisibility);
              player.removeEventListener('data_failed', handleFailure);
              player.removeEventListener('error', handleFailure);
              player.destroy();
            },
            { once: true },
          );
          player.addEventListener('DOMLoaded', handleVisibility);
          player.addEventListener('data_failed', handleFailure);
          player.addEventListener('error', handleFailure);
          document.addEventListener('visibilitychange', handleVisibility);
          if (typeof IntersectionObserver === 'function') {
            const observer = new IntersectionObserver((entries) => {
              const entry = entries.find((item) => item.target === node);
              if (entry) synchronize(entry.isIntersecting);
            });
            playback.signal.addEventListener('abort', () => observer.disconnect(), { once: true });
            observer.observe(node);
          }
          handleVisibility();
        } catch {
          playback.abort();
        }
      };
      const observePreference = () => {
        if (lifetime.signal.aborted) return;
        const playback = new AbortController();
        const cleanup = () => {
          preference.removeEventListener('change', handleChange);
          lifetime.signal.removeEventListener('abort', cleanup);
          playback.abort();
        };
        const handleChange = () => {
          cleanup();
          queueMicrotask(observePreference);
        };
        preference.addEventListener('change', handleChange, { once: true });
        lifetime.signal.addEventListener('abort', cleanup, { once: true });
        if (!preference.matches)
          queueMicrotask(() => {
            if (!playback.signal.aborted) void mountPlayer(playback);
          });
      };
      observePreference();
      return () => lifetime.abort();
    },
    [variant, loop],
  );

  return (
    <span
      data-motion={variant}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('relative inline-grid size-16 shrink-0 place-items-center text-accent', className)}
    >
      <span
        key={`${variant}:${loop}`}
        ref={attachPlayer}
        data-motion-player
        className={cn(
          'pointer-events-none absolute inset-0 [&_svg]:size-full',
          (variant === 'loading' || variant === 'success' || variant === 'error') &&
            '[&_path]:stroke-current',
        )}
      />
      <span
        data-motion-fallback
        className="col-start-1 row-start-1 flex size-full items-center justify-center"
      >
        {fallback ?? <Glyph className="size-full" />}
      </span>
    </span>
  );
}
