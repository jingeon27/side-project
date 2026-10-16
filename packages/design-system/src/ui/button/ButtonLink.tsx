import Link from 'next/link';
import type { ComponentProps } from 'react';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn.helper';
import { buttonVariants } from './Button';

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
