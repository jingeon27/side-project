import type { ComponentProps } from 'react';
import Link from 'next/link';

import type { VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/cn.helper';
import { iconButtonVariants } from './IconButton';

export interface IIconButtonLinkProps
  extends
    Omit<ComponentProps<typeof Link>, 'className' | 'aria-label'>,
    VariantProps<typeof iconButtonVariants> {
  /** 링크 이름(aria-label). 아이콘만 보이므로 반드시 넣는다. */
  label: string;
  className?: string;
}

/** IconButton처럼 보이는 Next 링크(다른 화면으로 가는 행동). 스크린 리더에는 링크로 읽힌다. */
export function IconButtonLink({ label, variant, className, title, ...props }: IIconButtonLinkProps) {
  return (
    <Link
      {...props}
      aria-label={label}
      title={title ?? label}
      className={cn(iconButtonVariants({ variant }), className)}
    />
  );
}
