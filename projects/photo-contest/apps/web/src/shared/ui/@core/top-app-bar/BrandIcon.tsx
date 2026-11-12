import { cn } from '../../../lib/cn.helper';

/** 그라데이션 바탕은 CSS로 칠해 한 화면에 여러 개 그려도 SVG gradient id가 겹치지 않는다. */
export function BrandIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-6 shrink-0 rounded-[36%] bg-brand-gradient', className)}
    >
      <svg focusable="false" viewBox="0 0 64 64" fill="none" className="size-full">
        <g className="stroke-on-gradient" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m16 25 5-3 5 3M38 25l5-3 5 3" />
          <path d="M20 37c7 10 20 10 27-2" />
        </g>
      </svg>
    </span>
  );
}
