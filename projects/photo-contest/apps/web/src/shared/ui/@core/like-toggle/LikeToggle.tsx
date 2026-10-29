'use client';

import type { ReactNode } from 'react';

import { Heart } from 'lucide-react';

import { cn } from '../../../lib/cn.helper';
import { Button, type IButtonProps } from '../button';
import {
  likeCountVariants,
  likeIconVariants,
  likeToggleVariants,
  type TLikeDensity,
} from './like-toggle.variants';

const BUTTON_SIZE = { card: 'md', chip: 'sm', inline: 'sm' } as const satisfies Record<
  TLikeDensity,
  IButtonProps['size']
>;
const STROKE_WIDTH = { card: 1.7, chip: 2, inline: 1.5 } as const satisfies Record<TLikeDensity, number>;

interface ILikeToggleProps extends Omit<
  IButtonProps,
  'children' | 'variant' | 'size' | 'loading' | 'aria-label' | 'aria-pressed'
> {
  density?: TLikeDensity;
  liked: boolean;
  /** 버튼의 접근성 이름. 보이는 수 대신 이 이름을 읽는다. */
  label: string;
  /** 하트 옆에 보이는 수 */
  children: ReactNode;
}

/**
 * 하트와 수를 보여 주는 좋아요 토글의 모양만 맡는다. mutation·낙관적 응답·진동과 응답을 기다리는 동안의 누름 무시는
 * 쓰는 쪽에 둔다. 낙관적으로 바로 바뀌므로 진행 표시(loading)는 두지 않는다.
 */
export function LikeToggle({
  density = 'card',
  liked,
  label,
  className,
  children,
  ...props
}: ILikeToggleProps) {
  return (
    <Button
      {...props}
      variant="ghost"
      size={BUTTON_SIZE[density]}
      aria-label={label}
      aria-pressed={liked}
      className={cn(likeToggleVariants({ density }), className)}
    >
      <Heart
        aria-hidden
        strokeWidth={STROKE_WIDTH[density]}
        className={cn(likeIconVariants({ density }), liked && 'fill-current')}
      />
      <span aria-hidden className={likeCountVariants({ density })}>
        {children}
      </span>
    </Button>
  );
}

/** 누를 수 없을 때(그룹에 가입하지 않음) 같은 모양으로 수만 보여 준다. */
export function LikeCount({
  density = 'card',
  liked,
  label,
  children,
}: {
  density?: TLikeDensity;
  liked: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <span
      aria-label={label}
      className={cn(
        'inline-flex min-h-touch items-center',
        likeToggleVariants({ density }),
        // 눌림 색은 버튼의 aria-pressed에만 쓰므로 표시만 할 때는 기본 색을 둔다.
        'text-muted',
      )}
    >
      <Heart
        aria-hidden
        strokeWidth={STROKE_WIDTH[density]}
        className={cn(likeIconVariants({ density }), liked && 'fill-current')}
      />
      <span aria-hidden className={likeCountVariants({ density })}>
        {children}
      </span>
    </span>
  );
}
