import type { ComponentProps, ReactNode } from 'react';

import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronDownIcon } from 'lucide-react';

import { cn } from '../../lib/cn.helper';

/** 바깥 모양. plain은 앱이 놓는 자리의 구분선·여백을 따르고, card는 테두리 카드, soft는 옅은 바탕이다. */
const disclosureVariants = cva('', {
  variants: {
    variant: {
      plain: '',
      card: 'rounded-card border border-line bg-surface p-4',
      soft: 'rounded-control bg-sunken px-3 py-2',
    },
  },
  defaultVariants: { variant: 'plain' },
});

export interface IDisclosureProps
  extends Omit<ComponentProps<'details'>, 'className'>, VariantProps<typeof disclosureVariants> {
  className?: string;
}

/**
 * native details라 hydration 전에도 열리고 Enter·Space 토글과 펼침 상태 안내를 브라우저가 맡는다.
 * 첫 자식으로 DisclosureTrigger를 둔다. 열림 상태는 앱이 open·onToggle이나 ref로 다룬다.
 */
export function Disclosure({ variant, className, ...props }: IDisclosureProps) {
  return (
    <details data-slot="disclosure" {...props} className={cn(disclosureVariants({ variant }), className)} />
  );
}

export interface IDisclosureTriggerProps extends Omit<ComponentProps<'summary'>, 'className' | 'children'> {
  /** 보이는 글자가 summary의 접근성 이름이 된다. 화살표는 그 뒤에 붙는다. */
  children: ReactNode;
  className?: string;
}

/**
 * 브라우저 기본 ▶ 표시는 list-none(Chrome·Firefox의 ::marker)과 ::-webkit-details-marker(Safari)로 숨기고
 * 끝에 ChevronDown을 둔다. 누르는 영역은 44px 이상이며 포커스는 base.css의 전역 :focus-visible 링을 쓴다.
 */
export function DisclosureTrigger({ className, children, ...props }: IDisclosureTriggerProps) {
  return (
    <summary
      data-slot="disclosure-trigger"
      {...props}
      className={cn(
        'cursor-pointer list-none text-label text-ink active:text-muted [&::-webkit-details-marker]:hidden',
        className,
      )}
    >
      {/* summary는 기본 display로 두고 줄 배치는 안쪽 span이 맡아 summary를 flex로 그리는 엔진 차이를 피한다. */}
      <span className="flex min-h-touch items-center gap-2">
        {/* 글자 뒤의 필수·오류 표시가 같은 줄 흐름을 유지하도록 한 칸으로 묶는다. */}
        <span className="min-w-0 flex-1">{children}</span>
        {/* group-open은 열린 조상 어디에나 반응해 중첩하면 닫힌 안쪽 화살표도 돈다. 자기 summary의 details만 본다. */}
        <ChevronDownIcon
          aria-hidden="true"
          data-slot="disclosure-icon"
          className="size-4 shrink-0 text-muted transition-transform in-[details[open]>summary]:rotate-180"
        />
      </span>
    </summary>
  );
}
