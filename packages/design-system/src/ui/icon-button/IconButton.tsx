import { Button as BaseButton } from '@base-ui/react/button';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '../../lib/cn.helper';
import { Button } from '../button/Button';

const iconButtonVariants = cva(
  [
    'relative inline-flex size-touch shrink-0 items-center justify-center rounded-full select-none',
    'transition-[background-color,color,transform] duration-150 active:not-data-disabled:scale-95',
    'data-disabled:cursor-not-allowed data-disabled:opacity-45',
  ],
  {
    variants: {
      variant: {
        ghost: 'text-ink hover:bg-neutral-soft active:not-data-disabled:bg-neutral-soft',
        soft: 'bg-sunken text-ink hover:bg-neutral-soft active:not-data-disabled:bg-neutral-soft',
        brand: 'bg-brand text-on-brand hover:bg-brand-strong active:not-data-disabled:bg-brand-strong',
      },
    },
    defaultVariants: { variant: 'ghost' },
  },
);

export interface IIconButtonProps
  extends
    Omit<ComponentProps<typeof BaseButton>, 'className' | 'aria-label'>,
    VariantProps<typeof iconButtonVariants> {
  /** 버튼 이름(aria-label). 아이콘만 보이므로 반드시 넣는다. */
  label: string;
  className?: string;
}

/** 44×44 아이콘 버튼. 아이콘은 children으로 넣는다(lucide 아이콘은 aria-hidden). */
export function IconButton({ label, variant, className, ...props }: IIconButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      {...props}
      aria-label={label}
      title={props.title ?? label}
      className={cn(iconButtonVariants({ variant }), className)}
    />
  );
}
