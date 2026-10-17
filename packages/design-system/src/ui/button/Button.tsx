// Adapted from shadcn/ui base-nova; semantic aliases and loading are shared extensions.
import { Button as BaseButton } from '@base-ui/react/button';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '../../lib/cn.helper';
import { Spinner } from '../spinner/Spinner';

export const buttonVariants = cva(
  [
    "relative group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-control border border-transparent bg-clip-padding text-button whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    'transition-[background-color,border-color,color,transform] duration-150 active:not-data-disabled:scale-[0.98]',
    'data-disabled:cursor-not-allowed data-disabled:opacity-45',
  ],
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/80',
        outline: 'border-border bg-background text-foreground hover:bg-neutral-soft',
        destructive: 'bg-destructive/10 text-destructive hover:bg-destructive/20',
        link: 'text-primary underline-offset-4 hover:underline',
        primary: 'bg-brand text-on-brand hover:bg-brand-strong active:not-data-disabled:bg-brand-strong',
        secondary:
          'border border-line-strong bg-surface text-ink hover:bg-sunken active:not-data-disabled:bg-sunken',
        ghost: 'bg-transparent text-ink hover:bg-neutral-soft active:not-data-disabled:bg-neutral-soft',
        danger: 'bg-danger text-on-brand hover:brightness-95 active:not-data-disabled:brightness-90',
        accent: 'bg-accent text-on-accent hover:brightness-95 active:not-data-disabled:brightness-90',
      },
      size: {
        default: 'h-touch gap-2 px-4',
        icon: 'size-touch',
        'icon-sm': 'size-touch',
        'icon-lg': 'size-cta',
        /** 50px. 화면의 주 행동(하단 CTA, 시트 제출) */
        lg: 'h-cta px-5',
        /** 44px. 보조 행동 */
        md: 'h-touch px-4',
        /** 36px 칩. 보이는 크기는 작아도 누르는 영역은 44px로 넓힌다. */
        sm: "h-9 px-3 text-label before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']",
      },
      fullWidth: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', fullWidth: false },
  },
);

export interface IButtonProps
  extends Omit<ComponentProps<typeof BaseButton>, 'className'>, VariantProps<typeof buttonVariants> {
  className?: string;
  /** 요청이 끝날 때까지 누르지 못하게 하고 진행 표시를 보여 준다. mutation의 loading을 그대로 넘긴다. */
  loading?: boolean;
}

/** 기본 버튼. 크기를 정하지 않으면 primary는 50px(lg), 나머지는 44px(md)이다. */
export function Button({
  variant,
  size,
  fullWidth,
  loading = false,
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
          fullWidth,
        }),
        className,
      )}
    >
      {loading ? <Spinner className="size-4" /> : null}
      {children}
    </BaseButton>
  );
}
