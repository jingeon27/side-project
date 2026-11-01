import { cn } from '../../../lib/cn.helper';

export function BrandIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 64 64"
      fill="none"
      className={cn('size-6 shrink-0', className)}
    >
      <rect width="64" height="64" rx="23" className="fill-accent" />
      <g className="stroke-on-accent" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m16 25 5-3 5 3M38 25l5-3 5 3" />
        <path d="M20 37c7 10 20 10 27-2" />
      </g>
    </svg>
  );
}
