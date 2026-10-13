import { Button as BaseButton } from '@base-ui/react/button';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import Link from 'next/link';
import type { ComponentProps } from 'react';

import { cn } from '../../../lib/cn.helper';
import { Spinner } from '../spinner';

const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 items-center justify-center gap-2 rounded-control text-button whitespace-nowrap select-none',
    'transition-[background-color,border-color,color,transform] duration-150 active:not-data-disabled:scale-[0.98]',
    'data-disabled:cursor-not-allowed data-disabled:opacity-45',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-brand text-on-brand hover:bg-brand-strong active:not-data-disabled:bg-brand-strong',
        secondary:
          'border border-line-strong bg-surface text-ink hover:bg-sunken active:not-data-disabled:bg-sunken',
        ghost: 'bg-transparent text-ink hover:bg-neutral-soft active:not-data-disabled:bg-neutral-soft',
        danger: 'bg-danger text-on-brand hover:brightness-95 active:not-data-disabled:brightness-90',
        accent: 'bg-accent text-ink hover:brightness-95 active:not-data-disabled:brightness-90',
      },
      size: {
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

export interface IButtonLinkProps
  extends Omit<ComponentProps<typeof Link>, 'className'>, VariantProps<typeof buttonVariants> {
  className?: string;
}

/** 버튼처럼 보이는 링크(다른 화면으로 가는 행동). 스크린 리더에는 링크로 읽힌다. */
export function ButtonLink({ variant, size, fullWidth, className, ...props }: IButtonLinkProps) {
  return (
    <Link
      {...props}
      className={cn(
        buttonVariants({
          variant,
          size: size ?? (variant === 'primary' || !variant ? 'lg' : 'md'),
          fullWidth,
        }),
        className,
      )}
    />
  );
}
