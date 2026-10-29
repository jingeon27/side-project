import type { ComponentProps } from 'react';

import { Button as BaseButton } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/cn.helper';
import { Button, buttonVariants } from '../button/Button';

const iconButtonShape = cva(
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
        primary: 'bg-brand text-on-brand hover:bg-brand-strong active:not-data-disabled:bg-brand-strong',
        accent: 'bg-accent text-on-accent hover:brightness-95 active:not-data-disabled:brightness-90',
      },
    },
    defaultVariants: { variant: 'ghost' },
  },
);

/**
 * 44×44 원형 아이콘 버튼의 전체 클래스. IconButton·IconButtonLink가 쓰며
 * 다른 요소(예: 라우터 링크)를 같은 모양으로 만들 때도 쓴다. 이름(aria-label)은 호출부가 붙인다.
 */
export function iconButtonVariants(props?: VariantProps<typeof iconButtonShape>) {
  return cn(buttonVariants({ variant: 'ghost', size: 'icon' }), iconButtonShape(props));
}

export interface IIconButtonProps
  extends
    Omit<ComponentProps<typeof BaseButton>, 'className' | 'aria-label'>,
    VariantProps<typeof iconButtonVariants> {
  /** 버튼 이름(aria-label). 아이콘만 보이므로 반드시 넣는다. */
  label: string;
  className?: string;
  /** 진행 중이면 아이콘 자리에 진행 표시를 보여 주고 누르지 못하게 하며 포커스는 유지한다. */
  loading?: boolean;
}

/** 44×44 아이콘 버튼. 아이콘은 children으로 넣는다(lucide 아이콘은 aria-hidden). */
export function IconButton({ label, variant, className, loading, children, ...props }: IIconButtonProps) {
  return (
    <Button
      {...props}
      variant="ghost"
      size="icon"
      loading={loading}
      icon={children}
      aria-label={label}
      title={props.title ?? label}
      className={cn(iconButtonVariants({ variant }), className)}
    />
  );
}
