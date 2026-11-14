// Adapted from shadcn/ui base-nova; house variants, sizes and loading replace the registry variants.
import type { ComponentProps, ReactNode } from 'react';

import { Button as BaseButton } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/cn.helper';
import { Spinner } from '../spinner/Spinner';

export const buttonVariants = cva(
  [
    "relative group/button inline-flex shrink-0 items-center justify-center gap-2 border border-transparent bg-clip-padding text-button whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 select-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    'transition-[background-color,border-color,color,transform] duration-150 active:not-data-disabled:scale-[0.98]',
    'data-disabled:cursor-not-allowed data-disabled:opacity-45',
  ],
  {
    variants: {
      /**
       * loading·focusableWhenDisabled 버튼은 native disabled가 아니라서 disabled:pointer-events-none이 걸리지 않는다.
       * Base UI는 비활성(loading 포함)이면 focusableWhenDisabled와 관계없이 data-disabled를 붙이므로 그것으로 hover 바탕을 막는다.
       * 조건은 :hover와 함께 :where()로 감싸 명시도를 클래스 하나(0,1,0)로 두고, hover:처럼 (hover: hover) 기기에서만 건다.
       * 임의 변형은 생성 CSS에서 맨 뒤에 나오므로 hover:를 밖에 두면(0,2,0) 호출부의 hover:bg-*와 aria-pressed:bg-* 같은
       * 상태 바탕(0,2,0)을 순서로 이긴다.
       * IconButton은 ghost 위에 같은 수식어로 바탕을 얹는다. 수식어가 달라지면 tailwind-merge가 ghost의 hover를 지우지 못한다.
       */
      variant: {
        primary:
          'bg-brand text-on-brand [@media(hover:hover)]:[&:where(:hover:not([data-disabled]))]:bg-brand-strong active:not-data-disabled:bg-brand-strong',
        secondary:
          'border border-line-strong bg-surface text-ink [@media(hover:hover)]:[&:where(:hover:not([data-disabled]))]:bg-sunken active:not-data-disabled:bg-sunken',
        ghost:
          'bg-transparent text-ink [@media(hover:hover)]:[&:where(:hover:not([data-disabled]))]:bg-neutral-soft active:not-data-disabled:bg-neutral-soft',
        danger:
          'bg-danger text-on-brand [@media(hover:hover)]:[&:where(:hover:not([data-disabled]))]:brightness-95 active:not-data-disabled:brightness-90',
        accent:
          'bg-accent text-on-accent [@media(hover:hover)]:[&:where(:hover:not([data-disabled]))]:brightness-95 active:not-data-disabled:brightness-90',
        /** 브랜드 그라데이션. 밝은 채도 위라 글자는 on-accent(검정)로 둔다. */
        gradient:
          'bg-brand-gradient text-on-accent shadow-glow [@media(hover:hover)]:[&:where(:hover:not([data-disabled]))]:brightness-105 active:not-data-disabled:brightness-95',
      },
      size: {
        /** 44×44 아이콘만 있는 버튼. 이름은 aria-label로 준다(IconButton 권장). */
        icon: 'size-touch',
        /** 50×50 아이콘 버튼 */
        'icon-lg': 'size-cta',
        /** 50px. 화면의 주 행동(하단 CTA, 시트 제출) */
        lg: 'h-cta px-5',
        /** 44px. 보조 행동 */
        md: 'h-touch px-4',
        /**
         * 36px 칩. 보이는 크기는 작아도 누르는 영역은 44px로 넓힌다. 가상 요소는 테두리 안쪽을 기준으로 놓이므로
         * 위아래를 늘리는 대신 가운데에 44px 높이로 둔다.
         */
        sm: "h-9 px-3 text-label before:absolute before:inset-x-0 before:top-1/2 before:h-touch before:-translate-y-1/2 before:content-['']",
      },
      shape: {
        /** 입력과 같은 8px 모서리 */
        rounded: 'rounded-control',
        /** 알약 모양. 피식은 만들기 진입(그룹 만들기·글쓰기·대회 개최하기)에 쓴다. */
        pill: 'rounded-full',
      },
      fullWidth: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', shape: 'rounded', fullWidth: false },
  },
);

export interface IButtonProps
  extends Omit<ComponentProps<typeof BaseButton>, 'className'>, VariantProps<typeof buttonVariants> {
  className?: string;
  /** 요청이 끝날 때까지 누르지 못하게 하고 진행 표시를 보여 준다. mutation의 loading을 그대로 넘긴다. */
  loading?: boolean;
  /**
   * 글자 앞 아이콘(lucide 아이콘은 aria-hidden). loading이면 같은 자리에 진행 표시를 대신 보여 주므로
   * `{!pending && <Icon />}`처럼 분기하지 않는다. children 안에 직접 넣은 아이콘은 진행 중에도 남는다.
   */
  icon?: ReactNode;
}

/** 기본 버튼. 크기를 정하지 않으면 primary는 50px(lg), 나머지는 44px(md)이다. */
export function Button({
  variant,
  size,
  shape,
  fullWidth,
  loading = false,
  icon,
  disabled,
  className,
  children,
  ...props
}: IButtonProps) {
  return (
    <BaseButton
      {...props}
      data-slot="button"
      disabled={disabled || loading}
      // 진행 중에도 포커스를 잃지 않아 키보드·스크린 리더 사용자가 위치를 잃지 않는다.
      focusableWhenDisabled={loading || props.focusableWhenDisabled}
      aria-busy={loading || undefined}
      className={cn(
        buttonVariants({
          variant,
          size: size ?? (variant === 'primary' || !variant ? 'lg' : 'md'),
          shape,
          fullWidth,
        }),
        className,
      )}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </BaseButton>
  );
}
