import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

import { cn } from '../../../lib/cn.helper';

const badgeVariants = cva(
  'inline-flex h-6 shrink-0 items-center gap-1 rounded-badge px-2 text-micro whitespace-nowrap',
  {
    variants: {
      tone: {
        brand: 'bg-brand-soft text-brand-strong',
        accent: 'bg-accent-soft text-accent-ink',
        neutral: 'bg-neutral-soft text-muted',
        danger: 'bg-danger-soft text-danger',
        info: 'bg-info-soft text-info',
        gold: 'bg-gold text-ink',
        silver: 'bg-silver text-ink',
        bronze: 'bg-bronze text-ink',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type TBadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

interface IBadgeProps extends VariantProps<typeof badgeVariants> {
  /** 색만으로 뜻을 전하지 않도록 글자를 꼭 넣는다(단계, 순위 등). */
  children: ReactNode;
  className?: string;
}

export function Badge({ tone, className, children }: IBadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)}>{children}</span>;
}
