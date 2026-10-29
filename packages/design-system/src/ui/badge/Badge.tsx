import type { ComponentProps, ReactNode } from 'react';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/cn.helper';

/** 모든 tone은 라이트·다크 모드에서 글자 대비 4.5:1 이상을 유지한다(Badge.test.tsx). */
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
        /* 메달 배경은 다크 모드에서도 밝으므로 모드에 따라 바뀌는 ink 대신 고정 글자색을 쓴다. */
        gold: 'bg-gold text-on-medal',
        silver: 'bg-silver text-on-medal',
        bronze: 'bg-bronze text-on-medal',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type TBadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export interface IBadgeProps
  extends Omit<ComponentProps<'span'>, 'className' | 'children'>, VariantProps<typeof badgeVariants> {
  /** 색만으로 뜻을 전하지 않도록 글자를 꼭 넣는다(단계, 순위 등). */
  children: ReactNode;
  className?: string;
}

/** 상태 글자. native span props(id·title·aria-*·data-*·ref)는 그대로 전달한다. */
export function Badge({ tone, className, ...props }: IBadgeProps) {
  return <span data-slot="badge" {...props} className={cn(badgeVariants({ tone }), className)} />;
}
