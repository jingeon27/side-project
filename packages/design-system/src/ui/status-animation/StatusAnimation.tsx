'use client';

import { useCallback, type ComponentType, type ReactNode } from 'react';

import { Cat, CircleAlert, CircleCheck, Gamepad2, Inbox, LoaderCircle, WifiOff } from 'lucide-react';

import { cn } from '../../lib/cn.helper';
import type { TMotionVariant } from './motion-assets';
import { attachMotionPlayer } from './motion-player';

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
      if (node) return attachMotionPlayer(node, { variant, loop });
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
