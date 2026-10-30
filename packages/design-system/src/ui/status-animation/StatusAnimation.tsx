'use client';

import { useCallback, useState, type ComponentType, type ReactNode } from 'react';

import { Cat, CircleAlert, CircleCheck, Gamepad2, Inbox, LoaderCircle, WifiOff } from 'lucide-react';

import { cn } from '../../lib/cn.helper';
import { MOTION_ANIMATIONS, type TMotionVariant } from './motion-assets';

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
  const [showPlayer, setShowPlayer] = useState(false);
  const Glyph = GLYPHS[variant];
  const attachPlayer = useCallback(
    (node: HTMLSpanElement | null) => {
      if (!node) return;
      setShowPlayer(false);
      if (typeof window.matchMedia !== 'function') return;
      const lifetime = new AbortController();
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const mount = async () => {
        try {
          const { default: lottie } = await import('lottie-web/build/player/lottie_light');
          if (lifetime.signal.aborted) return;
          const player = lottie.loadAnimation({
            container: node,
            renderer: 'svg',
            autoplay: false,
            loop,
            animationData: structuredClone(MOTION_ANIMATIONS[variant]),
            rendererSettings: { className: 'size-full', preserveAspectRatio: 'xMidYMid meet' },
          });
          const handlePlayback = () => {
            if (!player.isLoaded) return;
            const bounds = node.getBoundingClientRect();
            const visible =
              bounds.bottom > 0 &&
              bounds.top < window.innerHeight &&
              bounds.right > 0 &&
              bounds.left < window.innerWidth;
            if (reducedMotion.matches || document.hidden || !visible) {
              player.pause();
              setShowPlayer(!reducedMotion.matches);
              return;
            }
            setShowPlayer(true);
            player.play();
          };
          const observer =
            typeof IntersectionObserver === 'function' ? new IntersectionObserver(handlePlayback) : undefined;
          observer?.observe(node);
          player.addEventListener('DOMLoaded', handlePlayback);
          reducedMotion.addEventListener('change', handlePlayback);
          document.addEventListener('visibilitychange', handlePlayback);
          lifetime.signal.addEventListener(
            'abort',
            () => {
              observer?.disconnect();
              reducedMotion.removeEventListener('change', handlePlayback);
              document.removeEventListener('visibilitychange', handlePlayback);
              player.destroy();
            },
            { once: true },
          );
        } catch {
          // 애니메이션 청크를 못 받아도 정지 그림과 실제 조작은 사용할 수 있다.
        }
      };
      void mount();
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
        data-motion-fallback
        className={cn(
          'col-start-1 row-start-1 flex size-full items-center justify-center',
          showPlayer && 'invisible',
        )}
      >
        {fallback ?? <Glyph className="size-full" />}
      </span>
      <span
        ref={attachPlayer}
        data-motion-player
        className={cn(
          'pointer-events-none absolute inset-0 [&_svg]:size-full',
          !showPlayer && 'invisible',
          (variant === 'loading' || variant === 'success' || variant === 'error') &&
            '[&_path]:stroke-current',
        )}
      />
    </span>
  );
}
